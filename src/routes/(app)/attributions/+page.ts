import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase } = await parent();
  const filtre = url.searchParams.get('commercial') ?? '';

  let req = supabase
    .from('attributions')
    .select('id, commercial_id, article_ref, nom, code, prix, pct, qty_initial, qty_rest, created_at, commerciaux(nom)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtre) req = req.eq('commercial_id', filtre);

  const [a, c, art, tous] = await Promise.all([
    req,
    supabase.from('commerciaux').select('id, nom, pct_default').eq('status', 'actif').order('nom'),
    supabase.from('articles').select('id, code, nom, prix, pct_commission').eq('status', 'actif').order('nom'),
    // pour détecter les doublons, indépendamment du filtre d'affichage
    supabase.from('attributions').select('id, commercial_id, article_ref, nom, qty_initial, qty_rest')
  ]);
  if (a.error) throw a.error;
  return { attributions: a.data ?? [], commerciaux: c.data ?? [], articles: art.data ?? [], toutes: tous.data ?? [], filtre };
};
