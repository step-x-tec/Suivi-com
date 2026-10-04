import { toutCharger } from '$lib/pagination';
import type { PageLoad } from './$types';

// Codes / noms déjà en base : sert à repérer les doublons avant d'écrire quoi que ce soit
export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const [commerciaux, articles, groupes] = await Promise.all([
    toutCharger((a, b) => supabase.from('commerciaux').select('id, code').not('code', 'is', null).order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('articles').select('id, code').not('code', 'is', null).order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('groupes').select('id, nom').order('id').range(a, b))
  ]);
  return { commerciaux: commerciaux as any[], articles: articles as any[], groupes: groupes as any[] };
};
