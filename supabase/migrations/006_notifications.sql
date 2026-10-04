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
