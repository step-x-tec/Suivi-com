import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase, userId } = await parent();
  const [n, u] = await Promise.all([
    supabase.from('notifications').select('id, type, message, lien, read, created_at')
      .order('created_at', { ascending: false }).limit(100),
    // réglage d'envoi par e-mail (colonne ajoutée par la migration 009 : absente tant qu'elle n'est pas exécutée)
    supabase.from('users').select('notif_email').eq('id', userId).maybeSingle()
  ]);
  if (n.error) throw n.error;
  return { notifications: n.data ?? [], prefEmail: (u.data?.notif_email as string | undefined) ?? null };
};
