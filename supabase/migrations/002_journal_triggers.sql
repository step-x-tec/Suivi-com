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
