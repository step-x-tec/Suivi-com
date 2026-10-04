-- CommPro v2 — Migration 003 : retirer un membre ne doit pas être bloqué par l'historique.
-- Supprimer un utilisateur (auth.users -> public.users) conserve clôtures, règlements et journal ;
-- seul l'auteur est mis à NULL.
alter table public.clotures
  drop constraint clotures_created_by_fkey,
  add  constraint clotures_created_by_fkey foreign key (created_by) references public.users (id) on delete set null;

alter table public.reglements
  drop constraint reglements_created_by_fkey,
  add  constraint reglements_created_by_fkey foreign key (created_by) references public.users (id) on delete set null;

alter table public.activites
  drop constraint activites_user_id_fkey,
  add  constraint activites_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;
