-- CommPro v2 — Contrôle d'installation. À exécuter dans le SQL Editor APRÈS installation_complete.sql.
-- Chaque ligne doit commencer par ✓. Une ligne ✗ dit précisément ce qui manque.

select controle, resultat from (
  select 1 as n, 'Tables manquantes' as controle,
         coalesce((select string_agg(t, ', ') from unnest(array['activites', 'api_appels', 'api_cles', 'articles', 'attributions', 'cloture_counters', 'cloture_divers', 'cloture_lines', 'clotures', 'commerciaux', 'groupes', 'notifications', 'paiements', 'platform_admins', 'reglements', 'tenants', 'users']) t where to_regclass('public.' || t) is null), '✓ aucune') as resultat
  union all
  select 2, 'Tables sans sécurité de ligne (RLS)',
         coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '✓ aucune')
  union all
  select 3, 'Vue solde_commercial', case when to_regclass('public.solde_commercial') is not null then '✓ présente' else '✗ MANQUANTE' end
  union all
  select 4, 'Fonctions manquantes',
         coalesce((select string_agg(f, ', ') from unnest(array['activer_plan', 'alertes_retard', 'annuler_cloture', 'api_verifier', 'creer_cle_api', 'creer_cloture', 'creer_cloture_api', 'custom_access_token_hook', 'definir_preference_email', 'dest_admins', 'dest_commercial', 'emails_a_envoyer', 'fmt_montant', 'importer_v1', 'inscrire_entreprise', 'jwt_commercial', 'jwt_role', 'jwt_tenant', 'limites_plan', 'log_activite', 'marquer_emails_envoyes', 'notifier', 'plan_effectif', 'revoquer_cle_api', 'tarif_plan', 'trg_meme_tenant', 'trg_notif_attribution', 'trg_notif_cloture_annulee', 'trg_notif_cloture_validee', 'trg_notif_reglement', 'trg_quota_clotures', 'trg_quota_commerciaux', 'trg_quota_equipe', 'usage_plan']) f
                    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                       where n.nspname = 'public' and p.proname = f)), '✓ aucune')
  union all
  select 5, 'Déclencheurs manquants',
         coalesce((select string_agg(t, ', ') from unnest(array['trg_log_articles', 'trg_log_attr_ins', 'trg_log_attr_upd', 'trg_log_commerciaux', 'trg_log_groupes', 'trg_log_reglements', 'trg_meme_tenant_attributions', 'trg_meme_tenant_commerciaux', 'trg_meme_tenant_reglements', 'trg_meme_tenant_users', 'trg_notif_attr_ins', 'trg_notif_attr_upd', 'trg_notif_cloture_annulee', 'trg_notif_cloture_validee', 'trg_notif_reglement', 'trg_quota_clotures', 'trg_quota_commerciaux', 'trg_quota_equipe']) t
                    where not exists (select 1 from pg_trigger g where not g.tgisinternal and g.tgname = t)), '✓ aucun')
  union all
  select 6, 'Hook de jeton : droit d''exécution pour Supabase Auth',
         case when has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute') then '✓ ok' else '✗ manquant' end
  union all
  select 7, 'Hook de jeton : accès au schéma public pour Supabase Auth',
         case when has_schema_privilege('supabase_auth_admin', 'public', 'usage') then '✓ ok' else '✗ manquant' end
  union all
  select 8, 'Fonctions sensibles appelables sans connexion (rôle anon) — doit être vide',
         coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
                      and has_function_privilege('anon', p.oid, 'execute')), '✓ aucune')
  union all
  select 9, 'Fonctions sensibles appelables par un utilisateur connecté, hors liste prévue',
         coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
                      and has_function_privilege('authenticated', p.oid, 'execute')
                      and p.proname <> all(array['annuler_cloture', 'creer_cle_api', 'creer_cloture', 'definir_preference_email', 'importer_v1', 'inscrire_entreprise', 'revoquer_cle_api', 'usage_plan'])), '✓ aucune')
  union all
  select 10, 'Un administrateur ne peut PAS modifier le plan de son entreprise',
         case when not has_column_privilege('authenticated', 'public.tenants', 'plan', 'update')
                   and has_column_privilege('authenticated', 'public.tenants', 'name', 'update') then '✓ ok' else '✗ droit trop large sur tenants' end
  union all
  select 11, 'L''empreinte des clés API n''est pas lisible depuis l''application',
         case when not has_column_privilege('authenticated', 'public.api_cles', 'hash', 'select') then '✓ ok' else '✗ lisible' end
  union all
  select 12, 'Politiques de lecture de sa propre fiche (premier chargement)',
         case when (select count(*) from pg_policies where schemaname = 'public'
                      and policyname in ('users_self_select', 'tenants_membre_select')) = 2 then '✓ ok' else '✗ manquantes' end
  union all
  select 13, 'Notifications en direct (publication Realtime)',
         case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                              and schemaname = 'public' and tablename = 'notifications') then '✓ ok' else '✗ absente' end
  union all
  select 14, 'Extensions pg_cron et pg_net (rappels de retard, e-mails)',
         coalesce((select string_agg(e, ', ') || ' manquante(s)' from unnest(array['pg_cron', 'pg_net']) e
                    where not exists (select 1 from pg_extension x where x.extname = e)), '✓ ok')
  union all
  select 15, 'Tâches planifiées',
         case when to_regclass('cron.job') is null then 'ℹ pg_cron non activé'
              else (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from cron.job where jobname in (''alertes-retard'', ''envoyer-notifications'')', false, true, '')))[1]::text
                   || ' sur 2 (alertes-retard : migration 006 ; envoyer-notifications : à planifier, voir README)' end
  union all
  select 16, 'Entreprises / utilisateurs déjà créés (information)',
         (select count(*) from public.tenants)::text || ' entreprise(s), ' || (select count(*) from public.users)::text || ' utilisateur(s)'
  union all
  select 17, 'Politiques de sécurité ouvertes aux visiteurs non connectés — doit être vide',
         coalesce((select string_agg(tablename || '.' || policyname, ', ') from pg_policies
                    where schemaname = 'public' and roles && array['public', 'anon']::name[]), '✓ aucune')
) c order by n;
