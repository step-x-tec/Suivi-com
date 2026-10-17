-- CommPro v2 — Migration 011 : espace d'administration STEP-X (Super Admin).
-- Réservé aux comptes listés dans public.platform_admins. Chaque fonction vérifie elle-même ce droit : un utilisateur ordinaire,
-- même administrateur de son entreprise, reçoit « Réservé à STEP-X ». Rien n'est ouvert directement sur les tables.
--
-- Pour vous désigner Super Admin (une seule fois, dans le SQL Editor) :
--   insert into public.platform_admins (user_id) select id from auth.users where email = 'votre@adresse.com' on conflict do nothing;

create function public.est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Toutes les entreprises clientes, avec leur plan et leur activité
create function public.admin_entreprises() returns table (
  id uuid, nom text, email text, phone text, pays text, plan text, plan_effectif text, renouvellement date,
  cree_le timestamptz, commerciaux_actifs bigint, equipe bigint, clotures_mois bigint, derniere_activite timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_super_admin() then raise exception 'Réservé à STEP-X' using errcode = '42501'; end if;
  return query
  select t.id, t.name, t.email, t.phone, t.country, t.plan, public.plan_effectif(t.plan, t.plan_renouvellement),
         t.plan_renouvellement, t.created_at,
         (select count(*) from public.commerciaux c where c.tenant_id = t.id and c.status = 'actif'),
         (select count(*) from public.users u where u.tenant_id = t.id and u.role <> 'commercial'),
         (select count(*) from public.clotures k where k.tenant_id = t.id and k.status = 'validee'
            and k.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
         (select max(a.created_at) from public.activites a where a.tenant_id = t.id)
    from public.tenants t
   order by t.created_at desc;
end $$;

-- Changer le plan d'une entreprise (paiement reçu hors application, geste commercial, essai…)
create function public.admin_changer_plan(p_tenant uuid, p_plan text, p_jours integer default 30) returns date
language plpgsql security definer set search_path = public as $$
declare v_fin date;
begin
  if not public.est_super_admin() then raise exception 'Réservé à STEP-X' using errcode = '42501'; end if;
  if p_plan not in ('free', 'starter', 'pro', 'business') then raise exception 'Plan inconnu : %', p_plan; end if;
  if p_jours is null or p_jours < 1 or p_jours > 3660 then raise exception 'Durée invalide (1 à 3660 jours)'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'Entreprise introuvable'; end if;

  v_fin := case when p_plan = 'free' then null else current_date + p_jours end;
  update public.tenants set plan = p_plan, plan_renouvellement = v_fin where id = p_tenant;

  insert into public.activites (tenant_id, user_id, type, action, meta)
  values (p_tenant, (select u.id from public.users u where u.id = auth.uid()), 'sys', 'Plan modifié par STEP-X',
          jsonb_build_object('plan', p_plan, 'jusqu_au', v_fin));
  perform public.notifier(p_tenant, public.dest_admins(p_tenant), 'paiement',
    'Votre abonnement est maintenant « ' || p_plan || ' »' || coalesce(' jusqu''au ' || to_char(v_fin, 'DD/MM/YYYY'), ''));
  return v_fin;
end $$;

-- Derniers paiements en ligne, toutes entreprises (vide tant que le paiement en ligne est à l'arrêt)
create function public.admin_paiements() returns table (
  id uuid, entreprise text, plan text, periode text, montant integer, statut text, cree_le timestamptz, paye_le timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_super_admin() then raise exception 'Réservé à STEP-X' using errcode = '42501'; end if;
  return query
  select p.id, t.name, p.plan, p.periode, p.montant, p.statut, p.created_at, p.paid_at
    from public.paiements p join public.tenants t on t.id = p.tenant_id
   order by p.created_at desc limit 100;
end $$;

revoke execute on function public.est_super_admin, public.admin_entreprises, public.admin_changer_plan, public.admin_paiements from public, anon;
grant  execute on function public.est_super_admin, public.admin_entreprises, public.admin_changer_plan, public.admin_paiements to authenticated;
