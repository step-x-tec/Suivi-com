import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data, error } = await supabase.from('notifications')
    .select('id, type, message, lien, read, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return { notifications: data ?? [] };
};
