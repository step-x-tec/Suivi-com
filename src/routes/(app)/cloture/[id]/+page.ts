import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { supabase } = await parent();
  const [{ data: commercial }, { data: attributions }] = await Promise.all([
    supabase.from('commerciaux').select('id, nom, code').eq('id', params.id).maybeSingle(),
    supabase.from('attributions')
      .select('id, nom, prix, pct, qty_rest')
      .eq('commercial_id', params.id).gt('qty_rest', 0).order('nom')
  ]);
  if (!commercial) error(404, 'Commercial introuvable');
  return { commercial, attributions: attributions ?? [] };
};
