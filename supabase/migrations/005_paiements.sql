-- CommPro v2 — Migration 005 : paiement des abonnements (FedaPay, Mobile Money).
-- Le plan n'est JAMAIS activé depuis le navigateur : seule la fonction activer_plan(), réservée au
-- service role, après vérification du statut réel auprès de FedaPay (Edge Functions paiement-*).
-- Hypothèses à valider : abonnement annuel = 10 mois de prix mensuel ; 3 jours de grâce après
-- l'échéance ; un changement de plan en cours de période redémarre la période à partir d'aujourd'hui.

create table public.paiements (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants on delete cascade,
  plan             text not null check (plan in ('starter','pro','business')),
  periode          text not null check (periode in ('mensuel','annuel')),
  montant          integer not null check (montant > 0),
  devise           text not null default 'XOF',
  statut           text not null default 'en_attente'
                   check (statut in ('en_attente','approuve','refuse','annule','anomalie')),
  fournisseur      text not null default 'fedapay',
  fournisseur_ref  text unique,
  reference        text not null unique,
  created_by       uuid references public.users on delete set null,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  plan_active_jusqu date
);
create index on public.paiements (tenant_id, created_at desc);

alter table public.paiements enable row level security;
create policy paiements_select on public.paiements for select to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'admin');
-- aucune policy d'écriture : tout passe par les Edge Functions (service role)

-- Tarifs : source unique côté serveur (FCFA)
create function public.tarif_plan(p_plan text, p_periode text) returns integer
language plpgsql immutable as $$
declare v_mensuel int;
begin
  v_mensuel := case p_plan when 'starter' then 2500 when 'pro' then 5000 when 'business' then 12000 else null end;
  if v_mensuel is null then raise exception 'Plan inconnu : %', p_plan; end if;
  if p_periode = 'mensuel' then return v_mensuel;
  elsif p_periode = 'annuel' then return v_mensuel * 10;
  end if;
  raise exception 'Période inconnue : %', p_periode;
end $$;
revoke execute on function public.tarif_plan from public, anon, authenticated;
grant  execute on function public.tarif_plan to service_role;

-- Plan réellement appliqué : après échéance + 3 jours de grâce, retour aux limites du plan Gratuit.
-- (Les données restent intactes : seules les nouvelles créations sont limitées.)
create function public.plan_effectif(p_plan text, p_renouvellement date) returns text
language sql stable as $$
  select case
    when p_plan = 'free' or p_renouvellement is null then p_plan
    when p_renouvellement + 3 < current_date then 'free'
    else p_plan
  end
$$;

-- Les triggers de quotas (migration 004) utilisent désormais le plan effectif
create or replace function public.trg_quota_commerciaux() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  if new.status <> 'actif' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'actif' then return new; end if;
  select public.plan_effectif(plan, plan_renouvellement) into v_plan from public.tenants where id = new.tenant_id;
  v_max := (public.limites_plan(v_plan) ->> 'commerciaux')::int;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.commerciaux
   where tenant_id = new.tenant_id and status = 'actif' and id <> new.id;
  if v_n >= v_max then
    raise exception 'Limite du plan atteinte : % commerciaux actifs maximum (plan %). Passez à un plan supérieur.', v_max, v_plan;
  end if;
  return new;
end $$;

create or replace function public.trg_quota_clotures() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  select public.plan_effectif(plan, plan_renouvellement) into v_plan from public.tenants where id = new.tenant_id;
  v_max := (public.limites_plan(v_plan) ->> 'clotures_mois')::int;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.clotures
   where tenant_id = new.tenant_id and status = 'validee'
     and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  if v_n >= v_max then
    raise exception 'Limite du plan atteinte : % clôtures par mois (plan %). Passez à un plan supérieur.', v_max, v_plan;
  end if;
  return new;
end $$;

create or replace function public.trg_quota_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  if new.role = 'commercial' then return new; end if;
  if tg_op = 'UPDATE' and old.role <> 'commercial' then return new; end if;
  select public.plan_effectif(plan, plan_renouvellement) into v_plan from public.tenants where id = new.tenant_id;
  v_max := (public.limites_plan(v_plan) ->> 'equipe')::int;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.users
   where tenant_id = new.tenant_id and role <> 'commercial' and id <> new.id;
  if v_n >= v_max then
    raise exception 'Limite du plan atteinte : % membre(s) d''équipe maximum (plan %). Passez à un plan supérieur.', v_max, v_plan;
  end if;
  return new;
end $$;

create or replace function public.usage_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public.jwt_tenant(); v_plan text; v_ren date; v_eff text;
begin
  if v_t is null then return null; end if;
  select plan, plan_renouvellement into v_plan, v_ren from public.tenants where id = v_t;
  v_eff := public.plan_effectif(v_plan, v_ren);
  return jsonb_build_object(
    'plan', v_eff,
    'plan_souscrit', v_plan,
    'renouvellement', v_ren,
    'expire', (v_plan <> 'free' and v_eff = 'free'),
    'jours_restants', case when v_ren is null then null else (v_ren - current_date) end,
    'limites', public.limites_plan(v_eff),
    'usage', jsonb_build_object(
      'commerciaux',   (select count(*) from public.commerciaux where tenant_id = v_t and status = 'actif'),
      'clotures_mois', (select count(*) from public.clotures where tenant_id = v_t and status = 'validee'
                          and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
      'equipe',        (select count(*) from public.users where tenant_id = v_t and role <> 'commercial')
    )
  );
end $$;

-- Activation du plan après paiement approuvé. IDEMPOTENTE (un webhook reçu deux fois ne double
-- pas la période) et réservée au service role.
create function public.activer_plan(p_paiement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.paiements%rowtype;
  t public.tenants%rowtype;
  v_base date; v_fin date;
begin
  select * into p from public.paiements where id = p_paiement for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if p.statut = 'approuve' then return; end if;

  select * into t from public.tenants where id = p.tenant_id for update;
  -- même plan encore actif : on prolonge à partir de l'échéance ; sinon à partir d'aujourd'hui
  v_base := case when t.plan = p.plan and t.plan_renouvellement is not null and t.plan_renouvellement > current_date
                 then t.plan_renouvellement else current_date end;
  v_fin := (v_base + case p.periode when 'annuel' then interval '1 year' else interval '1 month' end)::date;

  update public.tenants set plan = p.plan, plan_renouvellement = v_fin where id = t.id;
  update public.paiements set statut = 'approuve', paid_at = now(), plan_active_jusqu = v_fin where id = p.id;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (p.tenant_id, p.created_by, 'sys', 'Abonnement activé',
          jsonb_build_object('plan', p.plan, 'periode', p.periode, 'montant', p.montant, 'jusqu_au', v_fin, 'reference', p.reference));

  if p.created_by is not null then
    insert into public.notifications (tenant_id, user_id, type, message)
    values (p.tenant_id, p.created_by, 'paiement',
            'Paiement reçu : plan ' || p.plan || ' actif jusqu''au ' || to_char(v_fin, 'DD/MM/YYYY'));
  end if;
end $$;
revoke execute on function public.activer_plan from public, anon, authenticated;
grant  execute on function public.activer_plan to service_role;
