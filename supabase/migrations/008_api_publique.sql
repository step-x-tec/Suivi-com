-- CommPro v2 — Migration 008 : API publique (plans Pro et Business).
-- Clés « cp_… » : seule l'empreinte SHA-256 est conservée, la clé en clair n'est montrée qu'une fois à la création.
-- Le contrôle (clé valide, plan Pro+, 60 requêtes/minute/clé) est fait par api_verifier(), appelée par l'Edge Function api-v1.

create table public.api_cles (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants on delete cascade,
  nom                  text not null,
  prefixe              text not null,
  hash                 text not null unique,
  created_by           uuid references public.users on delete set null,
  created_at           timestamptz not null default now(),
  derniere_utilisation timestamptz,
  revoquee_at          timestamptz
);
create index on public.api_cles (tenant_id, created_at desc);

alter table public.api_cles enable row level security;
create policy api_cles_select on public.api_cles for select to authenticated
  using (tenant_id = (select public.jwt_tenant()) and (select public.jwt_role()) = 'admin');
-- l'empreinte ne doit jamais sortir de la base, même pour l'administrateur
revoke select on public.api_cles from authenticated, anon;
grant  select (id, tenant_id, nom, prefixe, created_at, derniere_utilisation, revoquee_at) on public.api_cles to authenticated;

create table public.api_appels (
  cle_id uuid not null references public.api_cles on delete cascade,
  minute timestamptz not null,
  n      integer not null default 0,
  primary key (cle_id, minute)
);
alter table public.api_appels enable row level security; -- aucune policy : réservé aux fonctions

create function public.creer_cle_api(p_nom text) returns text
language plpgsql security definer set search_path = public as $$
declare v_t uuid := public.jwt_tenant(); v_plan text; v_token text; v_actives int;
begin
  if v_t is null or public.jwt_role() <> 'admin' then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  select public.plan_effectif(plan, plan_renouvellement) into v_plan from public.tenants where id = v_t;
  if not coalesce((public.limites_plan(v_plan) ->> 'api')::boolean, false) then
    raise exception 'L''accès API est disponible à partir du plan Pro.';
  end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Donnez un nom à la clé'; end if;
  select count(*) into v_actives from public.api_cles where tenant_id = v_t and revoquee_at is null;
  if v_actives >= 5 then raise exception 'Limite de 5 clés actives atteinte : révoquez-en une.'; end if;

  v_token := 'cp_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); -- 2 × 122 bits aléatoires
  insert into public.api_cles (tenant_id, nom, prefixe, hash, created_by)
  values (v_t, trim(p_nom), left(v_token, 11), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_t, auth.uid(), 'sys', 'Clé API créée', jsonb_build_object('nom', trim(p_nom)));
  return v_token;
end $$;

create function public.revoquer_cle_api(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t uuid := public.jwt_tenant();
begin
  if v_t is null or public.jwt_role() <> 'admin' then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  update public.api_cles set revoquee_at = now() where id = p_id and tenant_id = v_t and revoquee_at is null;
  if not found then raise exception 'Clé introuvable ou déjà révoquée'; end if;
  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_t, auth.uid(), 'sys', 'Clé API révoquée', jsonb_build_object('id', p_id));
end $$;

revoke execute on function public.creer_cle_api, public.revoquer_cle_api from public, anon;
grant  execute on function public.creer_cle_api, public.revoquer_cle_api to authenticated;

-- Contrôle d'une requête API : retourne { ok, tenant_id } ou { ok:false, code, erreur }
create function public.api_verifier(p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k record; v_plan text; v_n int; v_min timestamptz := date_trunc('minute', now());
begin
  select c.id, c.tenant_id, t.plan, t.plan_renouvellement into k
    from public.api_cles c join public.tenants t on t.id = c.tenant_id
   where c.hash = p_hash and c.revoquee_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 401, 'erreur', 'Clé API invalide ou révoquée');
  end if;
  v_plan := public.plan_effectif(k.plan, k.plan_renouvellement);
  if not coalesce((public.limites_plan(v_plan) ->> 'api')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 403, 'erreur', 'L''accès API nécessite le plan Pro ou supérieur');
  end if;

  insert into public.api_appels (cle_id, minute, n) values (k.id, v_min, 1)
  on conflict (cle_id, minute) do update set n = public.api_appels.n + 1
  returning n into v_n;
  if v_n = 1 then
    delete from public.api_appels where cle_id = k.id and minute < v_min - interval '1 hour';
    update public.api_cles set derniere_utilisation = now() where id = k.id;
  end if;
  if v_n > 60 then
    return jsonb_build_object('ok', false, 'code', 429, 'erreur', 'Trop de requêtes : 60 par minute et par clé');
  end if;
  return jsonb_build_object('ok', true, 'tenant_id', k.tenant_id);
end $$;

-- Clôture créée par l'API : même fonction que l'application (mêmes règles, mêmes quotas, même numérotation de reçu),
-- exécutée au nom du tenant avec le rôle « manager » (créer et clôturer, sans supprimer).
create function public.creer_cloture_api(p_tenant uuid, p_commercial_id uuid, p_method text, p_lines jsonb,
                                         p_divers jsonb default '[]', p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('tenant_id', p_tenant, 'user_role', 'manager')::text, true);
  return public.creer_cloture(p_commercial_id, p_method, p_lines, p_divers, p_note);
end $$;

revoke execute on function public.api_verifier, public.creer_cloture_api from public, anon, authenticated;
grant  execute on function public.api_verifier, public.creer_cloture_api to service_role;
