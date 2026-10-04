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
