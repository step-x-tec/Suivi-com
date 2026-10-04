import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { supabase } = await parent();
  const [c, s, a, h] = await Promise.all([
    supabase.from('commerciaux').select('*, groupes(nom)').eq('id', params.id).maybeSingle(),
    supabase.from('solde_commercial').select('*').eq('commercial_id', params.id).maybeSingle(),
    supabase.from('attributions').select('id, nom, prix, pct, qty_initial, qty_rest').eq('commercial_id', params.id).order('nom'),
    supabase.from('clotures').select('id, reference, net_final, status, created_at')
      .eq('commercial_id', params.id).order('created_at', { ascending: false }).limit(10)
  ]);
  if (!c.data) error(404, 'Commercial introuvable');
  return { c: c.data, solde: s.data, attributions: a.data ?? [], clotures: h.data ?? [] };
};
