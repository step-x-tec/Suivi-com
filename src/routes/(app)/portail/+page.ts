import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase, profil } = await parent();
  if (!profil.commercial_id) redirect(303, '/');
  const id = profil.commercial_id;

  const [c, s, a, k] = await Promise.all([
    supabase.from('commerciaux').select('nom, code').eq('id', id).maybeSingle(),
    supabase.from('solde_commercial').select('solde, statut').eq('commercial_id', id).maybeSingle(),
    supabase.from('attributions').select('id, nom, prix, pct, qty_initial, qty_rest').eq('commercial_id', id).order('nom'),
    supabase.from('clotures').select('id, reference, net_final, created_at')
      .eq('commercial_id', id).eq('status', 'validee').order('created_at', { ascending: false }).limit(20)
  ]);
  return { commercial: c.data, solde: s.data, attributions: a.data ?? [], clotures: k.data ?? [] };
};
