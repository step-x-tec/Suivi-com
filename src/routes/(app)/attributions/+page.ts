import { toutCharger } from '$lib/pagination';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase } = await parent();
  const [attributions, c, art, g] = await Promise.all([
    toutCharger((a, b) => supabase.from('attributions')
      .select('id, commercial_id, article_ref, nom, code, prix, pct, qty_initial, qty_rest, created_at, commerciaux(nom, groupe_id)')
      .order('created_at', { ascending: false }).order('id').range(a, b)),
    supabase.from('commerciaux').select('id, nom, pct_default').eq('status', 'actif').order('nom'),
    supabase.from('articles').select('id, code, nom, prix, pct_commission').eq('status', 'actif').order('nom'),
    supabase.from('groupes').select('id, nom').eq('archived', false).order('nom')
  ]);
  return {
    attributions: attributions as any[], commerciaux: c.data ?? [], articles: art.data ?? [], groupes: g.data ?? [],
    filtre: url.searchParams.get('commercial') ?? ''
  };
};
