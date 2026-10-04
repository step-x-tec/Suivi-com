-- =====================================================================
-- CommPro v2 — Migration 001 : socle (schéma + RLS + cœur métier)
-- STEP-X Technologies
--
-- Hypothèses à valider (voir README) :
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
