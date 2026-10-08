-- =====================================================================
-- CommPro v2 — INSTALLATION COMPLÈTE (migrations 001 à 009, dans l'ordre)
-- À coller et exécuter en une fois dans le SQL Editor d'un projet Supabase VIDE.
-- Ensuite : exécuter verification.sql, puis activer le hook de jeton (voir INSTALLATION.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- >>> 001_commpro_core.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- CommPro v2 — Migration 001 : socle (schéma + RLS + cœur métier)
-- STEP-X Technologies
--
-- NOTE : la règle des défauts (H2) ci-dessous est REMPLACÉE par la migration 007, alignée sur le prototype v1
--        (les défauts sont inclus dans les vendus, déduits du net, et remis en stock).
-- Hypothèses d'origine :
--  H1. Solde > 0 = commercial débiteur (il doit au patron).
--  H2. "Défauts" : déjà exclus des vendus valides (restants - saisis - défauts).
--      Leur valeur est stockée à titre informatif et N'EST PAS soustraite
--      une 2e fois du net : net = brut - commissions - divers.
--  H3. Arrondi par ligne (commission), 0 décimale pour CFA/XOF/XAF, sinon 2.
--  H4. Clôtures et règlements : jamais modifiés/supprimés directement.
--      Clôture = RPC creer_cloture / annuler_cloture. Correction = ajustement.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  country     text,
  devise      text not null default 'CFA',
  logo_url    text,
  plan        text not null default 'free' check (plan in ('free','starter','pro','business')),
  created_at  timestamptz not null default now()
);

create table public.commerciaux (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants on delete cascade,
  groupe_id     uuid,
  code          text,
  nom           text not null,
  telephone     text,
  email         text,
  zone          text,
  adresse       text,
  pct_default   numeric(5,2) not null default 0 check (pct_default between 0 and 100),
  status        text not null default 'actif' check (status in ('actif','inactif')),
  notes         text,
  portal_access boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.users (
  id            uuid primary key references auth.users on delete cascade,
  tenant_id     uuid not null references public.tenants on delete cascade,
  role          text not null check (role in ('admin','manager','comptable','commercial')),
  nom           text,
  email         text,
  phone         text,
  commercial_id uuid references public.commerciaux on delete set null,
  created_at    timestamptz not null default now(),
  check ((role = 'commercial') = (commercial_id is not null))
);

-- Super Admin STEP-X : hors tenant, accès via service role uniquement
create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.groupes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  nom         text not null,
  business    text,
  description text,
  color       text,
  zone        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.commerciaux
  add constraint commerciaux_groupe_fk foreign key (groupe_id) references public.groupes on delete set null;

create table public.articles (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants on delete cascade,
  code           text,
  nom            text not null,
  type           text not null default 'ticket' check (type in ('ticket','produit','service','autre')),
  prix           numeric(14,2) not null default 0 check (prix >= 0),
  pct_commission numeric(5,2) not null default 0 check (pct_commission between 0 and 100),
  stock_ref      integer not null default 0 check (stock_ref >= 0),
  status         text not null default 'actif' check (status in ('actif','inactif','archive')),
  description    text,
  created_at     timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.attributions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants on delete cascade,
  commercial_id uuid not null references public.commerciaux on delete cascade,
  article_ref   uuid references public.articles on delete set null,
  nom           text not null,
  code          text,
  type          text,
  qty_initial   integer not null check (qty_initial >= 0),
  qty_rest      integer not null check (qty_rest >= 0),
  prix          numeric(14,2) not null check (prix >= 0),
  pct           numeric(5,2) not null default 0 check (pct between 0 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.attributions (tenant_id, commercial_id);

create table public.clotures (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants on delete cascade,
  commercial_id uuid not null references public.commerciaux,
  method        text not null check (method in ('rest','vend')),
  status        text not null default 'validee' check (status in ('validee','annulee')),
  brut          numeric(14,2) not null default 0,
  commissions   numeric(14,2) not null default 0,
  defauts       numeric(14,2) not null default 0,  -- valeur informative (H2)
  divers        numeric(14,2) not null default 0,
  net_final     numeric(14,2) not null default 0,
  devise        text not null,
  reference     text not null,
  note          text,
  annulee_at    timestamptz,
  annulee_motif text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users,
  unique (tenant_id, reference)
);
create index on public.clotures (tenant_id, commercial_id, created_at desc);

create table public.cloture_lines (
  id             uuid primary key default gen_random_uuid(),
  cloture_id     uuid not null references public.clotures on delete cascade,
  attribution_id uuid not null references public.attributions,
  article_nom    text not null,
  prix           numeric(14,2) not null,
  pct            numeric(5,2) not null,
  qty_avant      integer not null,  -- qty_rest avant clôture (permet l'annulation)
  vend_valides   integer not null,
  defauts        integer not null default 0,
  rest_apres     integer not null,
  montant        numeric(14,2) not null,
  commission     numeric(14,2) not null,
  du             numeric(14,2) not null
);
create index on public.cloture_lines (cloture_id);
create index on public.cloture_lines (attribution_id);

create table public.cloture_divers (
  id         uuid primary key default gen_random_uuid(),
  cloture_id uuid not null references public.clotures on delete cascade,
  label      text not null,
  montant    numeric(14,2) not null check (montant >= 0)
);

-- Compteur de numéros de reçu : un par tenant et par mois
create table public.cloture_counters (
  tenant_id uuid not null references public.tenants on delete cascade,
  period    text not null,
  last_seq  integer not null default 0,
  primary key (tenant_id, period)
);

create table public.reglements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants on delete cascade,
  commercial_id   uuid not null references public.commerciaux,
  cloture_id      uuid references public.clotures,
  type            text not null check (type in ('remise','avance','frais','retour','ajustement','autre')),
  sens            text check (sens in ('credit','debit')),
  montant         numeric(14,2) not null check (montant > 0),
  mode            text check (mode in ('especes','mobile','virement','cheque','autre')),
  reference       text,
  note            text,
  date_reglement  date not null default current_date,
  devise          text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users,
  check ((type = 'ajustement') = (sens is not null))
);
create index on public.reglements (tenant_id, commercial_id, date_reglement desc);

create table public.activites (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  user_id    uuid references public.users,
  type       text not null,
  action     text not null,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activites (tenant_id, created_at desc);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  user_id    uuid not null references public.users on delete cascade,
  type       text not null,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. HELPERS JWT + HOOK D'AUTH (injecte tenant_id / rôle dans le token)
--    À activer : Auth > Hooks > Custom Access Token > public.custom_access_token_hook
-- ---------------------------------------------------------------------
create function public.jwt_tenant() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'tenant_id','')::uuid $$;

create function public.jwt_role() returns text
language sql stable as $$ select auth.jwt() ->> 'user_role' $$;

create function public.jwt_commercial() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'commercial_id','')::uuid $$;

create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb := event -> 'claims';
  u record;
begin
  select tenant_id, role, commercial_id into u
  from public.users where id = (event ->> 'user_id')::uuid;
  if found then
    claims := jsonb_set(claims, '{tenant_id}',     to_jsonb(u.tenant_id));
    claims := jsonb_set(claims, '{user_role}',     to_jsonb(u.role));
    claims := jsonb_set(claims, '{commercial_id}', coalesce(to_jsonb(u.commercial_id), 'null'::jsonb));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

revoke execute on function public.custom_access_token_hook from public, anon, authenticated;
grant  execute on function public.custom_access_token_hook to supabase_auth_admin;
grant  usage   on schema public to supabase_auth_admin;
grant  select  on public.users to supabase_auth_admin;
create policy "auth admin lit users" on public.users
  as permissive for select to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.users            enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.groupes          enable row level security;
alter table public.articles         enable row level security;
alter table public.commerciaux      enable row level security;
alter table public.attributions     enable row level security;
alter table public.clotures         enable row level security;
alter table public.cloture_lines    enable row level security;
alter table public.cloture_divers   enable row level security;
alter table public.cloture_counters enable row level security;
alter table public.reglements       enable row level security;
alter table public.activites        enable row level security;
alter table public.notifications    enable row level security;
-- platform_admins et cloture_counters : aucune policy = accès service role / fonctions seulement

-- Tenants / users
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.jwt_tenant());
create policy tenants_update on public.tenants for update to authenticated
  using (id = public.jwt_tenant() and public.jwt_role() = 'admin');

-- Chacun peut toujours lire SA fiche et SON entreprise, même si son jeton ne porte pas encore tenant_id
-- (première connexion, ou hook activé après coup) : l'application peut alors se réparer toute seule
-- (création de l'entreprise, renouvellement du jeton) au lieu d'afficher une erreur.
create policy users_self_select on public.users for select to authenticated
  using (id = auth.uid());
create policy tenants_membre_select on public.tenants for select to authenticated
  using (id in (select u.tenant_id from public.users u where u.id = auth.uid()));

create policy users_select on public.users for select to authenticated
  using (tenant_id = public.jwt_tenant()
         and (public.jwt_role() in ('admin','manager','comptable') or id = auth.uid()));
create policy users_admin_write on public.users for all to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'admin')
  with check (tenant_id = public.jwt_tenant() and public.jwt_role() = 'admin');

-- Lecture "staff" (admin / manager / comptable) sur les tables métier
do $$
declare t text;
begin
  foreach t in array array['groupes','articles','commerciaux','attributions',
                           'clotures','reglements','activites'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
      using (tenant_id = public.jwt_tenant()
             and public.jwt_role() in ('admin','manager','comptable'))$f$,
      t || '_staff_select', t);
  end loop;
end $$;

-- Portail commercial : uniquement ses propres données
create policy commerciaux_self_select on public.commerciaux for select to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'commercial'
         and id = public.jwt_commercial());
create policy attributions_self_select on public.attributions for select to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'commercial'
         and commercial_id = public.jwt_commercial());
create policy clotures_self_select on public.clotures for select to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'commercial'
         and commercial_id = public.jwt_commercial());
create policy reglements_self_select on public.reglements for select to authenticated
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'commercial'
         and commercial_id = public.jwt_commercial());

-- Lignes / divers : visibles si la clôture parente est visible (RLS de clotures)
create policy cloture_lines_select on public.cloture_lines for select to authenticated
  using (exists (select 1 from public.clotures c where c.id = cloture_id));
create policy cloture_divers_select on public.cloture_divers for select to authenticated
  using (exists (select 1 from public.clotures c where c.id = cloture_id));

-- Écriture : admin + manager (création / modification) ; suppression admin seul
do $$
declare t text;
begin
  foreach t in array array['groupes','articles','commerciaux','attributions'] loop
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (tenant_id = public.jwt_tenant() and public.jwt_role() in ('admin','manager'))$f$,
      t || '_ins', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (tenant_id = public.jwt_tenant() and public.jwt_role() in ('admin','manager'))
      with check (tenant_id = public.jwt_tenant())$f$,
      t || '_upd', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'admin')$f$,
      t || '_del', t);
  end loop;
end $$;

-- Règlements : insertion admin/manager ; jamais de update/delete direct (H4)
create policy reglements_ins on public.reglements for insert to authenticated
  with check (tenant_id = public.jwt_tenant() and public.jwt_role() in ('admin','manager'));

-- Notifications : chacun les siennes
create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid() and tenant_id = public.jwt_tenant())
  with check (user_id = auth.uid() and tenant_id = public.jwt_tenant());

-- Clôtures / journal : aucune policy d'écriture => écriture via fonctions uniquement

-- ---------------------------------------------------------------------
-- 4. INSCRIPTION D'UNE ENTREPRISE (appelée juste après auth.signUp)
--    Côté client : après l'appel, faire supabase.auth.refreshSession()
--    pour récupérer tenant_id / rôle dans le JWT.
-- ---------------------------------------------------------------------
create function public.inscrire_entreprise(
  p_entreprise text, p_nom text, p_phone text default null,
  p_pays text default null, p_devise text default 'CFA'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_email text;
begin
  if v_uid is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  if exists (select 1 from public.users where id = v_uid) then
    raise exception 'Compte déjà rattaché à une entreprise';
  end if;
  select email into v_email from auth.users where id = v_uid;

  insert into public.tenants (name, email, phone, country, devise)
  values (p_entreprise, v_email, p_phone, p_pays, coalesce(p_devise, 'CFA'))
  returning id into v_tenant;

  insert into public.users (id, tenant_id, role, nom, email, phone)
  values (v_uid, v_tenant, 'admin', p_nom, v_email, p_phone);

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_tenant, v_uid, 'sys', 'Création du compte entreprise', jsonb_build_object('entreprise', p_entreprise));

  return v_tenant;
end $$;

-- ---------------------------------------------------------------------
-- 5. CŒUR MÉTIER : CLÔTURE ATOMIQUE
--    p_lines  = [{"attribution_id": "...", "saisie": 12, "defauts": 1}, ...]
--               saisie = restants (method 'rest') ou vendus (method 'vend')
--    p_divers = [{"label": "Déplacement", "montant": 1500}, ...]
-- ---------------------------------------------------------------------
create function public.creer_cloture(
  p_commercial_id uuid,
  p_method        text,
  p_lines         jsonb,
  p_divers        jsonb default '[]',
  p_note          text  default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.jwt_tenant();
  v_role    text := public.jwt_role();
  v_user    uuid := auth.uid();
  v_devise  text;
  v_dec     int;
  v_id      uuid := gen_random_uuid();
  v_period  text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_seq     int;
  v_ref     text;
  l jsonb; d jsonb;
  a public.attributions%rowtype;
  v_saisie int; v_def int; v_vend int; v_rest int;
  v_montant numeric; v_comm numeric; v_du numeric;
  t_brut numeric := 0; t_comm numeric := 0; t_def numeric := 0; t_div numeric := 0;
  v_montant_div numeric;
begin
  if v_role is null or v_role not in ('admin','manager') then
    raise exception 'Droits insuffisants pour clôturer' using errcode = '42501';
  end if;
  if p_method not in ('rest','vend') then
    raise exception 'Méthode invalide (rest | vend)';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Aucune ligne de clôture';
  end if;
  if not exists (select 1 from public.commerciaux where id = p_commercial_id and tenant_id = v_tenant) then
    raise exception 'Commercial introuvable';
  end if;

  select devise into v_devise from public.tenants where id = v_tenant;
  v_dec := case when v_devise in ('CFA','XOF','XAF') then 0 else 2 end;

  -- Numéro de reçu : verrou implicite sur la ligne du compteur
  insert into public.cloture_counters (tenant_id, period, last_seq)
  values (v_tenant, v_period, 1)
  on conflict (tenant_id, period)
  do update set last_seq = public.cloture_counters.last_seq + 1
  returning last_seq into v_seq;
  v_ref := 'REC-' || v_period || '-' || lpad(v_seq::text, 4, '0');

  insert into public.clotures (id, tenant_id, commercial_id, method, devise, reference, note, created_by)
  values (v_id, v_tenant, p_commercial_id, p_method, v_devise, v_ref, p_note, v_user);

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into a from public.attributions
    where id = (l ->> 'attribution_id')::uuid
      and tenant_id = v_tenant and commercial_id = p_commercial_id
    for update;
    if not found then raise exception 'Attribution invalide : %', l ->> 'attribution_id'; end if;

    if (l ->> 'saisie') is null then raise exception 'Quantité manquante pour %', a.nom; end if;
    v_saisie := (l ->> 'saisie')::int;
    v_def    := coalesce((l ->> 'defauts')::int, 0);
    if v_saisie < 0 or v_def < 0 then raise exception 'Quantités négatives interdites (%)', a.nom; end if;

    if p_method = 'rest' then
      v_vend := a.qty_rest - v_saisie - v_def;
      v_rest := v_saisie;
    else
      v_vend := v_saisie;
      v_rest := a.qty_rest - v_saisie - v_def;
    end if;
    if v_vend < 0 or v_rest < 0 then
      raise exception 'Quantités incohérentes pour % (stock avant : %)', a.nom, a.qty_rest;
    end if;

    v_montant := round(v_vend * a.prix, v_dec);
    v_comm    := round(v_montant * a.pct / 100, v_dec);
    v_du      := v_montant - v_comm;

    insert into public.cloture_lines
      (cloture_id, attribution_id, article_nom, prix, pct, qty_avant,
       vend_valides, defauts, rest_apres, montant, commission, du)
    values (v_id, a.id, a.nom, a.prix, a.pct, a.qty_rest,
            v_vend, v_def, v_rest, v_montant, v_comm, v_du);

    update public.attributions set qty_rest = v_rest, updated_at = now() where id = a.id;

    t_brut := t_brut + v_montant;
    t_comm := t_comm + v_comm;
    t_def  := t_def + round(v_def * a.prix, v_dec);
  end loop;

  for d in select * from jsonb_array_elements(coalesce(p_divers, '[]'::jsonb)) loop
    v_montant_div := round(coalesce((d ->> 'montant')::numeric, 0), v_dec);
    if coalesce(trim(d ->> 'label'), '') = '' or v_montant_div < 0 then
      raise exception 'Déduction invalide';
    end if;
    insert into public.cloture_divers (cloture_id, label, montant)
    values (v_id, trim(d ->> 'label'), v_montant_div);
    t_div := t_div + v_montant_div;
  end loop;

  update public.clotures
  set brut = t_brut, commissions = t_comm, defauts = t_def, divers = t_div,
      net_final = t_brut - t_comm - t_div
  where id = v_id;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_tenant, v_user, 'cloture', 'Clôture ' || v_ref,
          jsonb_build_object('cloture_id', v_id, 'commercial_id', p_commercial_id,
                             'net_final', t_brut - t_comm - t_div));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. ANNULATION D'UNE CLÔTURE (admin) — restitue le stock, trace tout
--    Refusée si une clôture plus récente a touché les mêmes attributions.
-- ---------------------------------------------------------------------
create function public.annuler_cloture(p_cloture_id uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.jwt_tenant();
  c public.clotures%rowtype;
begin
  if public.jwt_role() <> 'admin' then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  if coalesce(trim(p_motif), '') = '' then raise exception 'Motif obligatoire'; end if;

  select * into c from public.clotures
  where id = p_cloture_id and tenant_id = v_tenant for update;
  if not found then raise exception 'Clôture introuvable'; end if;
  if c.status = 'annulee' then raise exception 'Clôture déjà annulée'; end if;

  if exists (
    select 1
    from public.cloture_lines cl
    join public.cloture_lines later on later.attribution_id = cl.attribution_id
    join public.clotures lc on lc.id = later.cloture_id
    where cl.cloture_id = c.id and lc.status = 'validee' and lc.created_at > c.created_at
  ) then
    raise exception 'Une clôture plus récente existe : annulez-la d''abord';
  end if;

  update public.attributions a
  set qty_rest = cl.qty_avant, updated_at = now()
  from public.cloture_lines cl
  where cl.cloture_id = c.id and a.id = cl.attribution_id;

  update public.clotures
  set status = 'annulee', annulee_at = now(), annulee_motif = trim(p_motif)
  where id = c.id;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_tenant, auth.uid(), 'cloture', 'Annulation ' || c.reference,
          jsonb_build_object('cloture_id', c.id, 'motif', trim(p_motif)));
end $$;

-- ---------------------------------------------------------------------
-- 7. SOLDE CRÉDIT (vue — RLS appliquée à l'appelant)
--    solde = clôtures - remises - avances + frais - retours ± ajustements
--    ajustement 'debit' augmente la dette du commercial, 'credit' la réduit.
-- ---------------------------------------------------------------------
create view public.solde_commercial with (security_invoker = true) as
select
  c.id        as commercial_id,
  c.tenant_id,
  coalesce(cl.total, 0)  as total_clotures,
  coalesce(r.remises, 0) as total_remises,
  coalesce(r.avances, 0) as total_avances,
  coalesce(r.frais, 0)   as total_frais,
  coalesce(r.retours, 0) as total_retours,
  coalesce(r.ajust, 0)   as total_ajustements,
  coalesce(cl.total, 0) - coalesce(r.remises, 0) - coalesce(r.avances, 0)
    + coalesce(r.frais, 0) - coalesce(r.retours, 0) + coalesce(r.ajust, 0) as solde,
  case
    when coalesce(cl.total, 0) - coalesce(r.remises, 0) - coalesce(r.avances, 0)
         + coalesce(r.frais, 0) - coalesce(r.retours, 0) + coalesce(r.ajust, 0) > 0 then 'debiteur'
    when coalesce(cl.total, 0) - coalesce(r.remises, 0) - coalesce(r.avances, 0)
         + coalesce(r.frais, 0) - coalesce(r.retours, 0) + coalesce(r.ajust, 0) < 0 then 'crediteur'
    else 'solde'
  end as statut
from public.commerciaux c
left join lateral (
  select sum(net_final) as total
  from public.clotures x
  where x.commercial_id = c.id and x.status = 'validee'
) cl on true
left join lateral (
  select
    sum(montant) filter (where type = 'remise')  as remises,
    sum(montant) filter (where type = 'avance')  as avances,
    sum(montant) filter (where type = 'frais')   as frais,
    sum(montant) filter (where type = 'retour')  as retours,
    sum(case when type = 'ajustement'
             then case sens when 'debit' then montant else -montant end end) as ajust
  from public.reglements y
  where y.commercial_id = c.id
) r on true;

-- ---------------------------------------------------------------------
-- 8. DROITS D'EXÉCUTION
-- ---------------------------------------------------------------------
revoke execute on function public.inscrire_entreprise, public.creer_cloture,
                           public.annuler_cloture from public, anon;
grant  execute on function public.inscrire_entreprise, public.creer_cloture,
                           public.annuler_cloture to authenticated;

-- ---------------------------------------------------------------------
-- >>> 002_journal_triggers.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 002 : journal d'activité automatique, intégrité entre entreprises, index
-- Trace créations / modifications / suppressions sur les tables de gestion.
-- (Les clôtures sont déjà tracées par creer_cloture / annuler_cloture.)

create function public.log_activite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_type text := case tg_op when 'INSERT' then 'add' when 'UPDATE' then 'edit' else 'del' end;
begin
  if tg_table_name = 'attributions' and tg_op = 'INSERT' then v_type := 'attr'; end if;
  if tg_table_name = 'reglements' then v_type := 'reglement'; end if;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values ((r ->> 'tenant_id')::uuid, auth.uid(), v_type,
          tg_table_name || ' ' || lower(tg_op),
          jsonb_build_object('table', tg_table_name, 'id', r ->> 'id',
                             'nom', coalesce(r ->> 'nom', r ->> 'type')));
  return coalesce(new, old);
end $$;

create trigger trg_log_groupes      after insert or update or delete on public.groupes
  for each row execute function public.log_activite();
create trigger trg_log_articles     after insert or update or delete on public.articles
  for each row execute function public.log_activite();
create trigger trg_log_commerciaux  after insert or update or delete on public.commerciaux
  for each row execute function public.log_activite();
create trigger trg_log_reglements   after insert on public.reglements
  for each row execute function public.log_activite();

-- Attributions : on ignore les mises à jour de stock faites par les clôtures
create trigger trg_log_attr_ins after insert or delete on public.attributions
  for each row execute function public.log_activite();
create trigger trg_log_attr_upd after update on public.attributions
  for each row when (old.qty_initial is distinct from new.qty_initial
                  or old.prix is distinct from new.prix
                  or old.pct  is distinct from new.pct)
  execute function public.log_activite();


-- ---------------------------------------------------------------------------------------------
-- Intégrité entre entreprises : une ligne ne peut référencer QUE des éléments de sa propre entreprise.
-- Les politiques RLS vérifient tenant_id de la ligne écrite, pas celui des éléments qu'elle référence ;
-- sans ce contrôle, quelqu'un connaissant l'identifiant d'un commercial d'une autre entreprise pourrait
-- y rattacher une attribution ou un règlement.
-- ---------------------------------------------------------------------------------------------
create function public.trg_meme_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'attributions' then
    if not exists (select 1 from public.commerciaux where id = new.commercial_id and tenant_id = new.tenant_id) then
      raise exception 'Commercial introuvable dans cette entreprise';
    end if;
    if new.article_ref is not null
       and not exists (select 1 from public.articles where id = new.article_ref and tenant_id = new.tenant_id) then
      raise exception 'Article introuvable dans cette entreprise';
    end if;
  elsif tg_table_name = 'commerciaux' then
    if new.groupe_id is not null
       and not exists (select 1 from public.groupes where id = new.groupe_id and tenant_id = new.tenant_id) then
      raise exception 'Groupe introuvable dans cette entreprise';
    end if;
  elsif tg_table_name = 'reglements' then
    if not exists (select 1 from public.commerciaux where id = new.commercial_id and tenant_id = new.tenant_id) then
      raise exception 'Commercial introuvable dans cette entreprise';
    end if;
    if new.cloture_id is not null
       and not exists (select 1 from public.clotures where id = new.cloture_id and tenant_id = new.tenant_id
                                                       and commercial_id = new.commercial_id) then
      raise exception 'Clôture introuvable pour ce commercial';
    end if;
  elsif tg_table_name = 'users' then
    if new.commercial_id is not null
       and not exists (select 1 from public.commerciaux where id = new.commercial_id and tenant_id = new.tenant_id) then
      raise exception 'Commercial introuvable dans cette entreprise';
    end if;
  end if;
  return new;
end $$;

create trigger trg_meme_tenant_attributions before insert or update of commercial_id, article_ref, tenant_id on public.attributions
  for each row execute function public.trg_meme_tenant();
create trigger trg_meme_tenant_commerciaux before insert or update of groupe_id, tenant_id on public.commerciaux
  for each row execute function public.trg_meme_tenant();
create trigger trg_meme_tenant_reglements before insert on public.reglements
  for each row execute function public.trg_meme_tenant();
create trigger trg_meme_tenant_users before insert or update of commercial_id, tenant_id on public.users
  for each row execute function public.trg_meme_tenant();

-- Index des requêtes les plus fréquentes (tableau de bord, rapports, crédit)
create index on public.clotures (tenant_id, status, created_at desc);
create index on public.reglements (commercial_id, type, date_reglement desc);
create index on public.attributions (tenant_id, qty_rest);
create index on public.commerciaux (tenant_id, status);

-- ---------------------------------------------------------------------
-- >>> 003_fk_users_set_null.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 003 : retirer un membre ne doit pas être bloqué par l'historique.
-- Supprimer un utilisateur (auth.users -> public.users) conserve clôtures, règlements et journal ;
-- seul l'auteur est mis à NULL.
alter table public.clotures
  drop constraint clotures_created_by_fkey,
  add  constraint clotures_created_by_fkey foreign key (created_by) references public.users (id) on delete set null;

alter table public.reglements
  drop constraint reglements_created_by_fkey,
  add  constraint reglements_created_by_fkey foreign key (created_by) references public.users (id) on delete set null;

alter table public.activites
  drop constraint activites_user_id_fkey,
  add  constraint activites_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;

-- ---------------------------------------------------------------------
-- >>> 004_plans_quotas.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 004 : plans et quotas appliqués côté base de données.
-- Les limites sont vérifiées par des triggers : impossible de les contourner depuis l'application.
-- Hypothèses : « équipe » = admin + managers + comptables (les comptes commerciaux du portail
-- ne comptent pas) ; seuls les commerciaux ACTIFS comptent ; une clôture annulée ne compte pas.
-- Après une rétrogradation, les données existantes sont conservées : seules les NOUVELLES
-- créations sont bloquées tant que l'usage dépasse la limite.

alter table public.tenants add column plan_renouvellement date;

-- Sécurité : un admin ne doit pas pouvoir se donner lui-même un plan supérieur.
-- Le plan se change par STEP-X (SQL / service role), jamais depuis l'application.
revoke update on public.tenants from authenticated;
grant  update (name, email, phone, country, devise, logo_url) on public.tenants to authenticated;

-- null = illimité
create function public.limites_plan(p_plan text) returns jsonb
language sql immutable as $$
  select (case p_plan
    when 'starter'  then '{"commerciaux":10,"clotures_mois":null,"equipe":1,"export_pdf":true,"api":false}'
    when 'pro'      then '{"commerciaux":50,"clotures_mois":null,"equipe":3,"export_pdf":true,"api":true}'
    when 'business' then '{"commerciaux":null,"clotures_mois":null,"equipe":10,"export_pdf":true,"api":true}'
    else                 '{"commerciaux":3,"clotures_mois":20,"equipe":1,"export_pdf":false,"api":false}'
  end)::jsonb
$$;

-- ---- Commerciaux actifs --------------------------------------------------
create function public.trg_quota_commerciaux() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  if new.status <> 'actif' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'actif' then return new; end if;
  select plan into v_plan from public.tenants where id = new.tenant_id;
  v_max := (public.limites_plan(v_plan) ->> 'commerciaux')::int;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.commerciaux
   where tenant_id = new.tenant_id and status = 'actif' and id <> new.id;
  if v_n >= v_max then
    raise exception 'Limite du plan atteinte : % commerciaux actifs maximum (plan %). Passez à un plan supérieur.', v_max, v_plan;
  end if;
  return new;
end $$;
create trigger trg_quota_commerciaux before insert or update of status on public.commerciaux
  for each row execute function public.trg_quota_commerciaux();

-- ---- Clôtures par mois ---------------------------------------------------
create function public.trg_quota_clotures() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  select plan into v_plan from public.tenants where id = new.tenant_id;
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
create trigger trg_quota_clotures before insert on public.clotures
  for each row execute function public.trg_quota_clotures();

-- ---- Équipe (admin / manager / comptable) --------------------------------
create function public.trg_quota_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  if new.role = 'commercial' then return new; end if;
  if tg_op = 'UPDATE' and old.role <> 'commercial' then return new; end if;
  select plan into v_plan from public.tenants where id = new.tenant_id;
  v_max := (public.limites_plan(v_plan) ->> 'equipe')::int;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.users
   where tenant_id = new.tenant_id and role <> 'commercial' and id <> new.id;
  if v_n >= v_max then
    raise exception 'Limite du plan atteinte : % membre(s) d''équipe maximum (plan %). Passez à un plan supérieur.', v_max, v_plan;
  end if;
  return new;
end $$;
create trigger trg_quota_equipe before insert or update of role on public.users
  for each row execute function public.trg_quota_equipe();

-- ---- Usage courant, pour l'affichage (source unique des limites) ---------
create function public.usage_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public.jwt_tenant(); v_plan text; v_ren date;
begin
  if v_t is null then return null; end if;
  select plan, plan_renouvellement into v_plan, v_ren from public.tenants where id = v_t;
  return jsonb_build_object(
    'plan', v_plan,
    'renouvellement', v_ren,
    'limites', public.limites_plan(v_plan),
    'usage', jsonb_build_object(
      'commerciaux',   (select count(*) from public.commerciaux where tenant_id = v_t and status = 'actif'),
      'clotures_mois', (select count(*) from public.clotures where tenant_id = v_t and status = 'validee'
                          and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
      'equipe',        (select count(*) from public.users where tenant_id = v_t and role <> 'commercial')
    )
  );
end $$;
revoke execute on function public.usage_plan from public, anon;
grant  execute on function public.usage_plan to authenticated;

-- Changer le plan d'un client (à exécuter par STEP-X dans le SQL Editor) :
--   update public.tenants set plan = 'pro', plan_renouvellement = current_date + 30 where id = '<uuid>';

-- ---------------------------------------------------------------------
-- >>> 005_paiements.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- >>> 006_notifications.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 006 : notifications dans l'application (cloche + messages en direct).
-- Créées par des triggers : l'application n'a rien à appeler et aucun client ne peut en fabriquer pour autrui.
--   nouvelle attribution / stock ajouté  -> le commercial concerné
--   clôture validée ou annulée           -> le commercial + les administrateurs (sauf l'auteur)
--   règlement enregistré                 -> le commercial + les administrateurs (sauf l'auteur)
--   stock bas (franchissement de 10 %)   -> les administrateurs
--   débiteur sans règlement > 30 jours   -> les administrateurs (quotidien, au plus 1 rappel / 7 jours / commercial)
-- Hors périmètre ici : e-mail et notification push (nécessitent un service d'envoi).

alter table public.notifications add column lien text;
alter table public.notifications add column cle  text;
create index on public.notifications (user_id, read, created_at desc);
create index on public.notifications (tenant_id, cle, created_at desc) where cle is not null;

-- ---- Outils internes (non appelables depuis l'application) ---------------------------------------
create function public.fmt_montant(p numeric, p_devise text) returns text
language sql immutable as $$
  select trim(replace(
    case when p_devise in ('CFA','XOF','XAF') then to_char(round(p), 'FM999,999,999,999,990')
         else to_char(round(p, 2), 'FM999,999,999,990.00') end, ',', ' '))
    || ' ' || case when p_devise in ('CFA','XOF','XAF') then 'FCFA' else p_devise end
$$;

create function public.dest_admins(p_tenant uuid, p_sauf uuid default null) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from public.users
   where tenant_id = p_tenant and role = 'admin' and id is distinct from p_sauf
$$;

create function public.dest_commercial(p_commercial uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from public.users where commercial_id = p_commercial
$$;

create function public.notifier(p_tenant uuid, p_users uuid[], p_type text, p_message text,
                                p_lien text default null, p_cle text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (tenant_id, user_id, type, message, lien, cle)
  select p_tenant, u, p_type, p_message, p_lien, p_cle from unnest(p_users) as u
$$;

revoke execute on function public.fmt_montant, public.dest_admins, public.dest_commercial, public.notifier
  from public, anon, authenticated;

-- ---- Attributions : nouvelle attribution, stock ajouté, stock bas ---------------------------------
create function public.trg_notif_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  if tg_op = 'INSERT' then
    perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'attribution',
      'Nouvelle attribution : ' || new.qty_initial || ' × ' || new.nom, '/portail');
    return new;
  end if;

  if new.qty_initial > old.qty_initial then
    perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'attribution',
      'Stock ajouté : +' || (new.qty_initial - old.qty_initial) || ' × ' || new.nom, '/portail');
  end if;

  -- stock bas : on n'alerte qu'au franchissement du seuil (10 % restants, lots d'au moins 10)
  if new.qty_initial >= 10 and new.qty_rest <= new.qty_initial * 0.1
     and not (old.qty_initial >= 10 and old.qty_rest <= old.qty_initial * 0.1) then
    select nom into v_nom from public.commerciaux where id = new.commercial_id;
    perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id), 'stock',
      'Stock bas : ' || coalesce(v_nom, '—') || ', ' || new.nom || ' (il reste ' || new.qty_rest || ' sur ' || new.qty_initial || ')',
      '/attributions', 'stock:' || new.id);
  end if;
  return new;
end $$;

create trigger trg_notif_attr_ins after insert on public.attributions
  for each row execute function public.trg_notif_attribution();
create trigger trg_notif_attr_upd after update of qty_initial, qty_rest on public.attributions
  for each row execute function public.trg_notif_attribution();

-- ---- Clôtures : validée (totaux écrits en fin de creer_cloture) et annulée ------------------------
create function public.trg_notif_cloture_validee() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text; v_txt text;
begin
  select nom into v_nom from public.commerciaux where id = new.commercial_id;
  v_txt := public.fmt_montant(new.net_final, new.devise);
  perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'cloture',
    'Clôture ' || new.reference || ' validée : net à payer ' || v_txt, '/recu/' || new.id);
  perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id, auth.uid()), 'cloture',
    'Clôture ' || new.reference || ' (' || coalesce(v_nom, '—') || ') : ' || v_txt, '/recu/' || new.id);
  return new;
end $$;
create trigger trg_notif_cloture_validee after update of net_final on public.clotures
  for each row when (new.status = 'validee') execute function public.trg_notif_cloture_validee();

create function public.trg_notif_cloture_annulee() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  select nom into v_nom from public.commerciaux where id = new.commercial_id;
  perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'cloture',
    'Clôture ' || new.reference || ' annulée', '/portail');
  perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id, auth.uid()), 'cloture',
    'Clôture ' || new.reference || ' (' || coalesce(v_nom, '—') || ') annulée', '/historique');
  return new;
end $$;
create trigger trg_notif_cloture_annulee after update of status on public.clotures
  for each row when (old.status = 'validee' and new.status = 'annulee') execute function public.trg_notif_cloture_annulee();

-- ---- Règlements ------------------------------------------------------------------------------------
create function public.trg_notif_reglement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text; v_lib text; v_txt text;
begin
  select nom into v_nom from public.commerciaux where id = new.commercial_id;
  v_lib := case new.type when 'remise' then 'Remise' when 'avance' then 'Avance' when 'frais' then 'Frais à payer'
                         when 'retour' then 'Retour d''articles' when 'ajustement' then 'Ajustement' else 'Règlement' end;
  v_txt := public.fmt_montant(new.montant, new.devise);
  perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'reglement',
    v_lib || ' enregistré : ' || v_txt, '/credit/' || new.commercial_id || '/releve');
  perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id, auth.uid()), 'reglement',
    v_lib || ' : ' || coalesce(v_nom, '—') || ', ' || v_txt, '/credit/' || new.commercial_id);
  return new;
end $$;
create trigger trg_notif_reglement after insert on public.reglements
  for each row execute function public.trg_notif_reglement();

-- ---- Rappel quotidien : débiteurs sans règlement depuis plus de 30 jours -------------------------
create function public.alertes_retard() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    select s.commercial_id, s.tenant_id, s.solde, c.nom, t.devise,
           current_date - coalesce(
             (select max(g.date_reglement) from public.reglements g
               where g.commercial_id = s.commercial_id and g.type in ('remise', 'avance')),
             (select min(k.created_at)::date from public.clotures k
               where k.commercial_id = s.commercial_id and k.status = 'validee')) as jours
    from public.solde_commercial s
    join public.commerciaux c on c.id = s.commercial_id
    join public.tenants t on t.id = s.tenant_id
    where s.solde > 0
  loop
    continue when r.jours is null or r.jours <= 30;
    continue when exists (select 1 from public.notifications x
                           where x.tenant_id = r.tenant_id and x.cle = 'retard:' || r.commercial_id
                             and x.created_at > now() - interval '7 days');
    perform public.notifier(r.tenant_id, public.dest_admins(r.tenant_id), 'retard',
      r.nom || ' : ' || public.fmt_montant(r.solde, r.devise) || ' dû, aucun règlement depuis ' || r.jours || ' jours',
      '/credit/' || r.commercial_id, 'retard:' || r.commercial_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.alertes_retard from public, anon, authenticated;

-- Planification quotidienne (7 h UTC) si l'extension pg_cron est activée (Database > Extensions)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('alertes-retard', '0 7 * * *', 'select public.alertes_retard()');
  end if;
end $$;

-- Messages en direct (Supabase Realtime) : les politiques RLS s'appliquent, chacun ne reçoit que les siens
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- >>> 007_alignement_v1_et_import.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 007 : alignement sur le calcul de clôture du prototype v1 + import des données v1.
--
-- Règles reprises du prototype CommPro v1 (validerClo) :
--   vendus      = restants avant − restants saisis      (méthode « restants »)  |  vendus saisis (méthode « vendus »)
--   vendus valides = vendus − défauts                    (les défauts sont INCLUS dans les vendus saisis)
--   brut        = vendus × prix                          (défauts compris)
--   commission  = vendus valides × prix × % ; dû = vendus valides × prix − commission
--   défauts déduits = défauts × prix ; net = brut − commissions − défauts − divers
--   stock après = restants + défauts  (les articles défectueux reviennent dans le stock du commercial)
-- Seule différence volontaire : le net n'est PAS plafonné à 0 (voir README), et des défauts supérieurs aux
-- ventes sont refusés au lieu d'être ignorés.

-- Les lignes de clôture survivent à la suppression d'une attribution (historique conservé)
alter table public.cloture_lines add column vend integer;
update public.cloture_lines set vend = vend_valides + defauts;
alter table public.cloture_lines alter column vend set not null;
alter table public.cloture_lines alter column attribution_id drop not null;
alter table public.cloture_lines drop constraint cloture_lines_attribution_id_fkey;
alter table public.cloture_lines add constraint cloture_lines_attribution_id_fkey
  foreign key (attribution_id) references public.attributions (id) on delete set null;

create or replace function public.creer_cloture(
  p_commercial_id uuid,
  p_method        text,
  p_lines         jsonb,
  p_divers        jsonb default '[]',
  p_note          text  default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.jwt_tenant();
  v_role    text := public.jwt_role();
  v_user    uuid := auth.uid();
  v_devise  text;
  v_dec     int;
  v_id      uuid := gen_random_uuid();
  v_period  text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_seq     int;
  v_ref     text;
  l jsonb; d jsonb;
  a public.attributions%rowtype;
  v_saisie int; v_def int; v_vend int; v_valides int; v_rest int;
  v_brut_l numeric; v_montant numeric; v_comm numeric; v_du numeric;
  t_brut numeric := 0; t_comm numeric := 0; t_def numeric := 0; t_div numeric := 0;
  v_montant_div numeric;
begin
  if v_role is null or v_role not in ('admin','manager') then
    raise exception 'Droits insuffisants pour clôturer' using errcode = '42501';
  end if;
  if p_method not in ('rest','vend') then
    raise exception 'Méthode invalide (rest | vend)';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Aucune ligne de clôture';
  end if;
  if not exists (select 1 from public.commerciaux where id = p_commercial_id and tenant_id = v_tenant) then
    raise exception 'Commercial introuvable';
  end if;

  select devise into v_devise from public.tenants where id = v_tenant;
  v_dec := case when v_devise in ('CFA','XOF','XAF') then 0 else 2 end;

  insert into public.cloture_counters (tenant_id, period, last_seq)
  values (v_tenant, v_period, 1)
  on conflict (tenant_id, period)
  do update set last_seq = public.cloture_counters.last_seq + 1
  returning last_seq into v_seq;
  v_ref := 'REC-' || v_period || '-' || lpad(v_seq::text, 4, '0');

  insert into public.clotures (id, tenant_id, commercial_id, method, devise, reference, note, created_by)
  values (v_id, v_tenant, p_commercial_id, p_method, v_devise, v_ref, p_note, v_user);

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into a from public.attributions
    where id = (l ->> 'attribution_id')::uuid
      and tenant_id = v_tenant and commercial_id = p_commercial_id
    for update;
    if not found then raise exception 'Attribution invalide : %', l ->> 'attribution_id'; end if;

    if (l ->> 'saisie') is null then raise exception 'Quantité manquante pour %', a.nom; end if;
    v_saisie := (l ->> 'saisie')::int;
    v_def    := coalesce((l ->> 'defauts')::int, 0);
    if v_saisie < 0 or v_def < 0 then raise exception 'Quantités négatives interdites (%)', a.nom; end if;

    v_vend := case when p_method = 'rest' then a.qty_rest - v_saisie else v_saisie end;
    v_rest := a.qty_rest - v_vend;
    if v_vend < 0 or v_rest < 0 then
      raise exception 'Quantités incohérentes pour % (stock avant : %)', a.nom, a.qty_rest;
    end if;
    if v_def > v_vend then
      raise exception 'Défauts supérieurs aux ventes pour % (% défaut(s) pour % vendu(s))', a.nom, v_def, v_vend;
    end if;

    v_valides := v_vend - v_def;
    v_brut_l  := round(v_vend * a.prix, v_dec);
    v_montant := round(v_valides * a.prix, v_dec);
    v_comm    := round(v_montant * a.pct / 100, v_dec);
    v_du      := v_montant - v_comm;

    insert into public.cloture_lines
      (cloture_id, attribution_id, article_nom, prix, pct, qty_avant,
       vend, vend_valides, defauts, rest_apres, montant, commission, du)
    values (v_id, a.id, a.nom, a.prix, a.pct, a.qty_rest,
            v_vend, v_valides, v_def, v_rest + v_def, v_montant, v_comm, v_du);

    -- les défauts reviennent dans le stock du commercial (comportement v1)
    update public.attributions set qty_rest = v_rest + v_def, updated_at = now() where id = a.id;

    t_brut := t_brut + v_brut_l;
    t_comm := t_comm + v_comm;
    t_def  := t_def + (v_brut_l - v_montant);
  end loop;

  for d in select * from jsonb_array_elements(coalesce(p_divers, '[]'::jsonb)) loop
    v_montant_div := round(coalesce((d ->> 'montant')::numeric, 0), v_dec);
    if coalesce(trim(d ->> 'label'), '') = '' or v_montant_div < 0 then
      raise exception 'Déduction invalide';
    end if;
    insert into public.cloture_divers (cloture_id, label, montant)
    values (v_id, trim(d ->> 'label'), v_montant_div);
    t_div := t_div + v_montant_div;
  end loop;

  update public.clotures
  set brut = t_brut, commissions = t_comm, defauts = t_def, divers = t_div,
      net_final = t_brut - t_comm - t_def - t_div
  where id = v_id;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_tenant, v_user, 'cloture', 'Clôture ' || v_ref,
          jsonb_build_object('cloture_id', v_id, 'commercial_id', p_commercial_id,
                             'net_final', t_brut - t_comm - t_def - t_div));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Import en une fois des données du prototype v1 (réservé à l'admin, compte vide uniquement).
-- Pendant l'import (réglage transaction-local app.import = on) : pas d'entrées de journal ni de
-- notifications par ligne, et le quota de clôtures par mois ne s'applique pas à l'historique.
-- Les quotas de commerciaux et d'équipe, eux, restent appliqués.
-- ---------------------------------------------------------------------------------------------
create or replace function public.log_activite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_type text := case tg_op when 'INSERT' then 'add' when 'UPDATE' then 'edit' else 'del' end;
begin
  if current_setting('app.import', true) = 'on' then return coalesce(new, old); end if;
  if tg_table_name = 'attributions' and tg_op = 'INSERT' then v_type := 'attr'; end if;
  if tg_table_name = 'reglements' then v_type := 'reglement'; end if;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values ((r ->> 'tenant_id')::uuid, auth.uid(), v_type,
          tg_table_name || ' ' || lower(tg_op),
          jsonb_build_object('table', tg_table_name, 'id', r ->> 'id',
                             'nom', coalesce(r ->> 'nom', r ->> 'type')));
  return coalesce(new, old);
end $$;

create or replace function public.trg_notif_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  if current_setting('app.import', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'attribution',
      'Nouvelle attribution : ' || new.qty_initial || ' × ' || new.nom, '/portail');
    return new;
  end if;

  if new.qty_initial > old.qty_initial then
    perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'attribution',
      'Stock ajouté : +' || (new.qty_initial - old.qty_initial) || ' × ' || new.nom, '/portail');
  end if;

  if new.qty_initial >= 10 and new.qty_rest <= new.qty_initial * 0.1
     and not (old.qty_initial >= 10 and old.qty_rest <= old.qty_initial * 0.1) then
    select nom into v_nom from public.commerciaux where id = new.commercial_id;
    perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id), 'stock',
      'Stock bas : ' || coalesce(v_nom, '—') || ', ' || new.nom || ' (il reste ' || new.qty_rest || ' sur ' || new.qty_initial || ')',
      '/attributions', 'stock:' || new.id);
  end if;
  return new;
end $$;

create or replace function public.trg_notif_reglement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nom text; v_lib text; v_txt text;
begin
  if current_setting('app.import', true) = 'on' then return new; end if;
  select nom into v_nom from public.commerciaux where id = new.commercial_id;
  v_lib := case new.type when 'remise' then 'Remise' when 'avance' then 'Avance' when 'frais' then 'Frais à payer'
                         when 'retour' then 'Retour d''articles' when 'ajustement' then 'Ajustement' else 'Règlement' end;
  v_txt := public.fmt_montant(new.montant, new.devise);
  perform public.notifier(new.tenant_id, public.dest_commercial(new.commercial_id), 'reglement',
    v_lib || ' enregistré : ' || v_txt, '/credit/' || new.commercial_id || '/releve');
  perform public.notifier(new.tenant_id, public.dest_admins(new.tenant_id, auth.uid()), 'reglement',
    v_lib || ' : ' || coalesce(v_nom, '—') || ', ' || v_txt, '/credit/' || new.commercial_id);
  return new;
end $$;

create or replace function public.trg_quota_clotures() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_max int; v_n int;
begin
  if current_setting('app.import', true) = 'on' then return new; end if;
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

create function public.importer_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public.jwt_tenant();
  v_devise text;
  g jsonb; a jsonb; c jsonb; k jsonb; l jsonb; d jsonb; r jsonb;
  v_id uuid; v_cid uuid; v_gid uuid; v_aid uuid; v_kid uuid;
  v_created timestamptz; v_period text; v_seq int; v_ref text;
  n_g int := 0; n_art int := 0; n_c int := 0; n_a int := 0; n_k int := 0; n_r int := 0; n_ignores int := 0;
begin
  if v_t is null or public.jwt_role() <> 'admin' then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  if exists (select 1 from public.groupes where tenant_id = v_t)
     or exists (select 1 from public.articles where tenant_id = v_t)
     or exists (select 1 from public.commerciaux where tenant_id = v_t)
     or exists (select 1 from public.attributions where tenant_id = v_t)
     or exists (select 1 from public.clotures where tenant_id = v_t)
     or exists (select 1 from public.reglements where tenant_id = v_t) then
    raise exception 'L''import CommPro v1 n''est possible que sur un compte vide (aucun groupe, article, commercial, attribution, clôture ni règlement).';
  end if;

  select devise into v_devise from public.tenants where id = v_t;
  perform set_config('app.import', 'on', true);
  create temp table tmp_map (kind text, ref text, id uuid) on commit drop;

  for g in select e from jsonb_array_elements(coalesce(p -> 'groupes', '[]'::jsonb)) as t(e) loop
    insert into public.groupes (tenant_id, nom, business, description, color)
    values (v_t, g ->> 'nom', g ->> 'business', g ->> 'description', coalesce(g ->> 'color', '#f5a524'))
    returning id into v_id;
    insert into tmp_map values ('g', g ->> 'ref', v_id);
    n_g := n_g + 1;
  end loop;

  for a in select e from jsonb_array_elements(coalesce(p -> 'articles', '[]'::jsonb)) as t(e) loop
    insert into public.articles (tenant_id, code, nom, type, prix, pct_commission, stock_ref, status, description)
    values (v_t, a ->> 'code', a ->> 'nom', a ->> 'type', (a ->> 'prix')::numeric,
            (a ->> 'pct_commission')::numeric, (a ->> 'stock_ref')::int, a ->> 'status', a ->> 'description');
    n_art := n_art + 1;
  end loop;

  for c in select e from jsonb_array_elements(coalesce(p -> 'commerciaux', '[]'::jsonb)) as t(e) loop
    select id into v_gid from tmp_map where kind = 'g' and ref = c ->> 'groupe_ref';
    insert into public.commerciaux (tenant_id, groupe_id, code, nom, telephone, email, zone, adresse, pct_default, status, notes, created_at)
    values (v_t, v_gid, c ->> 'code', c ->> 'nom', c ->> 'telephone', c ->> 'email', c ->> 'zone', c ->> 'adresse',
            (c ->> 'pct_default')::numeric, c ->> 'status', c ->> 'notes',
            coalesce((c ->> 'created_at')::timestamptz, now()))
    returning id into v_id;
    insert into tmp_map values ('c', c ->> 'ref', v_id);
    n_c := n_c + 1;
  end loop;

  for a in select e from jsonb_array_elements(coalesce(p -> 'attributions', '[]'::jsonb)) as t(e) loop
    select id into v_cid from tmp_map where kind = 'c' and ref = a ->> 'commercial_ref';
    if v_cid is null then n_ignores := n_ignores + 1; continue; end if;
    v_created := coalesce((a ->> 'created_at')::timestamptz, now());
    insert into public.attributions (tenant_id, commercial_id, nom, code, type, qty_initial, qty_rest, prix, pct, created_at, updated_at)
    values (v_t, v_cid, a ->> 'nom', a ->> 'code', a ->> 'type', (a ->> 'qty_initial')::int, (a ->> 'qty_rest')::int,
            (a ->> 'prix')::numeric, (a ->> 'pct')::numeric, v_created, v_created)
    returning id into v_id;
    insert into tmp_map values ('a', a ->> 'ref', v_id);
    n_a := n_a + 1;
  end loop;

  -- Clôtures dans l'ordre chronologique : numéros de reçu REC-AAAAMM-XXXX attribués mois par mois
  for k in select e from jsonb_array_elements(coalesce(p -> 'clotures', '[]'::jsonb)) as t(e)
           order by (e ->> 'created_at')::timestamptz loop
    select id into v_cid from tmp_map where kind = 'c' and ref = k ->> 'commercial_ref';
    if v_cid is null then n_ignores := n_ignores + 1; continue; end if;
    v_created := coalesce((k ->> 'created_at')::timestamptz, now());
    v_period := to_char(v_created at time zone 'utc', 'YYYYMM');
    insert into public.cloture_counters (tenant_id, period, last_seq) values (v_t, v_period, 1)
    on conflict (tenant_id, period) do update set last_seq = public.cloture_counters.last_seq + 1
    returning last_seq into v_seq;
    v_ref := 'REC-' || v_period || '-' || lpad(v_seq::text, 4, '0');

    insert into public.clotures (tenant_id, commercial_id, method, status, brut, commissions, defauts, divers, net_final,
                                 devise, reference, created_at)
    values (v_t, v_cid, k ->> 'method', 'validee', (k ->> 'brut')::numeric, (k ->> 'commissions')::numeric,
            (k ->> 'defauts')::numeric, (k ->> 'divers')::numeric, (k ->> 'net_final')::numeric,
            v_devise, v_ref, v_created)
    returning id into v_kid;
    insert into tmp_map values ('k', k ->> 'ref', v_kid);

    for l in select e from jsonb_array_elements(coalesce(k -> 'lines', '[]'::jsonb)) as t(e) loop
      select id into v_aid from tmp_map where kind = 'a' and ref = l ->> 'attribution_ref';
      insert into public.cloture_lines (cloture_id, attribution_id, article_nom, prix, pct, qty_avant, vend, vend_valides,
                                        defauts, rest_apres, montant, commission, du)
      values (v_kid, v_aid, l ->> 'article_nom', (l ->> 'prix')::numeric, (l ->> 'pct')::numeric, (l ->> 'qty_avant')::int,
              (l ->> 'vend')::int, (l ->> 'vend_valides')::int, (l ->> 'defauts')::int, (l ->> 'rest_apres')::int,
              (l ->> 'montant')::numeric, (l ->> 'commission')::numeric, (l ->> 'du')::numeric);
    end loop;

    for d in select e from jsonb_array_elements(coalesce(k -> 'divers_lignes', '[]'::jsonb)) as t(e) loop
      insert into public.cloture_divers (cloture_id, label, montant) values (v_kid, d ->> 'label', (d ->> 'montant')::numeric);
    end loop;
    n_k := n_k + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p -> 'reglements', '[]'::jsonb)) as t(e) loop
    select id into v_cid from tmp_map where kind = 'c' and ref = r ->> 'commercial_ref';
    if v_cid is null then n_ignores := n_ignores + 1; continue; end if;
    select id into v_kid from tmp_map where kind = 'k' and ref = r ->> 'cloture_ref';
    insert into public.reglements (tenant_id, commercial_id, cloture_id, type, sens, montant, mode, reference, note,
                                   date_reglement, devise, created_at)
    values (v_t, v_cid, v_kid, r ->> 'type', r ->> 'sens', (r ->> 'montant')::numeric, r ->> 'mode', r ->> 'reference',
            r ->> 'note', (r ->> 'date_reglement')::date, v_devise,
            coalesce((r ->> 'created_at')::timestamptz, now()));
    n_r := n_r + 1;
  end loop;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (v_t, auth.uid(), 'sys', 'Import des données CommPro v1',
          jsonb_build_object('groupes', n_g, 'articles', n_art, 'commerciaux', n_c, 'attributions', n_a,
                             'clotures', n_k, 'reglements', n_r, 'ignores', n_ignores));

  return jsonb_build_object('groupes', n_g, 'articles', n_art, 'commerciaux', n_c, 'attributions', n_a,
                            'clotures', n_k, 'reglements', n_r, 'ignores', n_ignores);
end $$;
revoke execute on function public.importer_v1 from public, anon;
grant  execute on function public.importer_v1 to authenticated;

-- ---------------------------------------------------------------------
-- >>> 008_api_publique.sql
-- ---------------------------------------------------------------------
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
  using (tenant_id = public.jwt_tenant() and public.jwt_role() = 'admin');
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

-- ---------------------------------------------------------------------
-- >>> 009_notifications_email.sql
-- ---------------------------------------------------------------------
-- CommPro v2 — Migration 009 : notifications par e-mail (immédiat ou résumé quotidien, au choix de chacun).
-- Principe : les notifications de la migration 006 restent la source ; une tâche planifiée appelle l'Edge Function
-- « envoyer-notifications » toutes les 5 minutes, qui envoie ce que la base lui désigne (emails_a_envoyer) puis le marque envoyé.
--   · immédiat   : chaque notification non lue, dans les 3 jours, part au prochain passage (regroupées par personne) ;
--   · quotidien  : un seul e-mail récapitulatif par jour, à partir de 7 h UTC ;
--   · jamais     : rien n'est envoyé.
-- Une notification déjà lue dans l'application n'est jamais envoyée par e-mail.

alter table public.users
  add column notif_email text not null default 'immediat' check (notif_email in ('immediat', 'quotidien', 'jamais')),
  add column email_dernier_envoi timestamptz;

alter table public.notifications add column email_envoye_at timestamptz;
create index on public.notifications (created_at) where email_envoye_at is null and read = false;

-- Choix de la personne connectée (seule voie de modification : les autres colonnes de users restent réservées à l'admin)
create function public.definir_preference_email(p_freq text) returns void
language plpgsql security definer set search_path = public as $$
declare v_avant text;
begin
  if auth.uid() is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  if p_freq not in ('immediat', 'quotidien', 'jamais') then raise exception 'Choix invalide'; end if;
  select notif_email into v_avant from public.users where id = auth.uid();
  update public.users set notif_email = p_freq where id = auth.uid();
  -- en quittant « jamais », on n'envoie pas d'un coup tout ce qui s'est accumulé pendant ce temps
  if v_avant = 'jamais' and p_freq <> 'jamais' then
    update public.notifications set email_envoye_at = now() where user_id = auth.uid() and email_envoye_at is null;
  end if;
end $$;
revoke execute on function public.definir_preference_email from public, anon;
grant  execute on function public.definir_preference_email to authenticated;

-- Ce qu'il faut envoyer maintenant : une ligne par personne, avec ses notifications
create function public.emails_a_envoyer() returns table (user_id uuid, email text, nom text, mode text, notifications jsonb)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, u.nom, u.notif_email,
         jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'message', n.message, 'lien', n.lien, 'created_at', n.created_at)
                   order by n.created_at)
    from public.users u
    join public.notifications n on n.user_id = u.id
   where n.email_envoye_at is null and n.read = false
     and n.created_at > now() - interval '3 days'
     and u.email is not null and u.notif_email <> 'jamais'
     and (u.notif_email = 'immediat'
          or (extract(hour from now() at time zone 'utc') >= 7
              and (u.email_dernier_envoi is null or u.email_dernier_envoi < now() - interval '23 hours')))
   group by u.id, u.email, u.nom, u.notif_email
$$;

create function public.marquer_emails_envoyes(p_user uuid, p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.notifications set email_envoye_at = now() where user_id = p_user and id = any(p_ids);
  update public.users set email_dernier_envoi = now() where id = p_user;
$$;

revoke execute on function public.emails_a_envoyer, public.marquer_emails_envoyes from public, anon, authenticated;
grant  execute on function public.emails_a_envoyer, public.marquer_emails_envoyes to service_role;
