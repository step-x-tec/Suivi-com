import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data } = await supabase.rpc('est_super_admin'); // en cas d'erreur (migration absente), pas de lien
  return { superAdmin: data === true };
};
