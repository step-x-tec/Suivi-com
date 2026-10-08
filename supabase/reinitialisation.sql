-- =====================================================================
-- ⚠️  RÉINITIALISATION — SUPPRIME TOUTES LES DONNÉES DE L'APPLICATION ET TOUS LES COMPTES UTILISATEURS.
-- À n'utiliser que sur un projet de test que vous voulez repartir de zéro. Irréversible.
-- Avant de l'exécuter : Authentication > Auth Hooks : DÉSACTIVEZ les hooks (sinon l'authentification
-- appellera une fonction qui n'existe plus tant que l'installation n'est pas refaite).
-- Plus simple et plus propre : créer un NOUVEAU projet Supabase (mais il faudra changer les 2 clés dans Netlify).
-- =====================================================================
drop schema public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

delete from auth.users;   -- supprime aussi les comptes de test (et leurs sessions)
