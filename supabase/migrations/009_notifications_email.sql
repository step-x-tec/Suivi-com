-- CommPro v2 — Migration 009 : notifications par e-mail (immédiat ou résumé quotidien, au choix de chacun).
-- Principe : les notifications de la migration 006 restent la source ; une tâche planifiée appelle l'Edge Function
-- « envoyer-notifications » toutes les 5 minutes, qui envoie ce que la base lui désigne (emails_a_envoyer) puis le marque envoyé.
--   · immédiat   : chaque notification non lue, dans les 3 jours, part au prochain passage (regroupées par personne) ;
--   · quotidien  : un seul e-mail récapitulatif par jour, à partir de 7 h UTC ;
--   · jamais     : rien n'est envoyé.
-- Une notification déjà lue dans l'application n'est jamais envoyée par e-mail.

alter table public.users
  add column notif_email text not null default 'immediat' check (notif_email in ('immediat', 'quotidien', 'jamais')),
  add column email_dernier_envoi timestamptz;

alter table public.notifications add column email_envoye_at timestamptz;
create index on public.notifications (created_at) where email_envoye_at is null and read = false;

-- Choix de la personne connectée (seule voie de modification : les autres colonnes de users restent réservées à l'admin)
create function public.definir_preference_email(p_freq text) returns void
language plpgsql security definer set search_path = public as $$
declare v_avant text;
begin
  if auth.uid() is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  if p_freq not in ('immediat', 'quotidien', 'jamais') then raise exception 'Choix invalide'; end if;
  select notif_email into v_avant from public.users where id = auth.uid();
  update public.users set notif_email = p_freq where id = auth.uid();
  -- en quittant « jamais », on n'envoie pas d'un coup tout ce qui s'est accumulé pendant ce temps
  if v_avant = 'jamais' and p_freq <> 'jamais' then
    update public.notifications set email_envoye_at = now() where user_id = auth.uid() and email_envoye_at is null;
  end if;
end $$;
revoke execute on function public.definir_preference_email from public, anon;
grant  execute on function public.definir_preference_email to authenticated;

-- Ce qu'il faut envoyer maintenant : une ligne par personne, avec ses notifications
create function public.emails_a_envoyer() returns table (user_id uuid, email text, nom text, mode text, notifications jsonb)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, u.nom, u.notif_email,
         jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'message', n.message, 'lien', n.lien, 'created_at', n.created_at)
                   order by n.created_at)
    from public.users u
    join public.notifications n on n.user_id = u.id
   where n.email_envoye_at is null and n.read = false
     and n.created_at > now() - interval '3 days'
     and u.email is not null and u.notif_email <> 'jamais'
     and (u.notif_email = 'immediat'
          or (extract(hour from now() at time zone 'utc') >= 7
              and (u.email_dernier_envoi is null or u.email_dernier_envoi < now() - interval '23 hours')))
   group by u.id, u.email, u.nom, u.notif_email
$$;

create function public.marquer_emails_envoyes(p_user uuid, p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.notifications set email_envoye_at = now() where user_id = p_user and id = any(p_ids);
  update public.users set email_dernier_envoi = now() where id = p_user;
$$;

revoke execute on function public.emails_a_envoyer, public.marquer_emails_envoyes from public, anon, authenticated;
grant  execute on function public.emails_a_envoyer, public.marquer_emails_envoyes to service_role;
