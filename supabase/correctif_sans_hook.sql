-- CommPro v2 — CORRECTIF pour une base déjà installée : supprime la dépendance au hook « Customize Access Token ».
-- À exécuter une fois dans le SQL Editor. Ensuite : Authentication > Auth Hooks : vous pouvez DÉSACTIVER tous les hooks.
-- (Les nouvelles installations via installation_complete.sql contiennent déjà ces définitions.)

create or replace function public.jwt_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select u.tenant_id from public.users u where u.id = auth.uid()),
                  nullif(auth.jwt() ->> 'tenant_id', '')::uuid)
$$;

create or replace function public.jwt_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select u.role from public.users u where u.id = auth.uid()), auth.jwt() ->> 'user_role')
$$;

create or replace function public.jwt_commercial() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select u.commercial_id from public.users u where u.id = auth.uid()),
                  nullif(auth.jwt() ->> 'commercial_id', '')::uuid)
$$;

revoke execute on function public.jwt_tenant, public.jwt_role, public.jwt_commercial from public, anon;
grant  execute on function public.jwt_tenant, public.jwt_role, public.jwt_commercial to authenticated, service_role;

-- Lecture de sa propre fiche et de son entreprise (si la base a été installée avant cette version)
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users for select to authenticated using (id = auth.uid());
drop policy if exists tenants_membre_select on public.tenants;
create policy tenants_membre_select on public.tenants for select to authenticated
  using (id in (select u.tenant_id from public.users u where u.id = auth.uid()));

-- Contrôle : doit renvoyer votre entreprise et votre rôle
select public.jwt_tenant() as entreprise, public.jwt_role() as role;
