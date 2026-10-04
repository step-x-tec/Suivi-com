-- CommPro v2 — Migration 002 : journal d'activité automatique
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
