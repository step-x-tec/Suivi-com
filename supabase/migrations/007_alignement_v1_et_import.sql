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
