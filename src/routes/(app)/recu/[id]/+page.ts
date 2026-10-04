import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { supabase } = await parent();
  const { data, error: e } = await supabase
    .from('clotures')
    .select('*, commerciaux(nom, code, telephone), cloture_lines(*), cloture_divers(*)')
    .eq('id', params.id).maybeSingle();
  if (e || !data) error(404, 'Reçu introuvable');
  return { c: data };
};
