import { ilYaJours } from '$lib/dashboard';
import { toutCharger } from '$lib/pagination';
import { periode } from '$lib/rapports';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase } = await parent();
  const defaut = periode('mois');
  const du = url.searchParams.get('du') ?? defaut.du;
  const au = url.searchParams.get('au') ?? defaut.au;
  const groupe = url.searchParams.get('groupe') ?? '';
  const article = url.searchParams.get('article') ?? '';
  const depuis = du < ilYaJours(90) ? du : ilYaJours(90); // courbe 30 jours et carte de chaleur 12 semaines

  const [clotures, lignesBrutes, attributions, reglements, premieres, s, m, g, d] = await Promise.all([
    toutCharger((a, b) => supabase.from('clotures').select('id, commercial_id, created_at, net_final, commerciaux(groupe_id)')
      .eq('status', 'validee').gte('created_at', `${depuis}T00:00:00`).order('created_at').order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('cloture_lines')
      .select('id, article_nom, montant, commission, clotures!inner(created_at, status, commercial_id, commerciaux(groupe_id))')
      .eq('clotures.status', 'validee').gte('clotures.created_at', `${du}T00:00:00`).lte('clotures.created_at', `${au}T23:59:59.999`)
      .order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('attributions').select('id, commercial_id, nom, prix, qty_initial, qty_rest, commerciaux(nom, groupe_id)').order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('reglements').select('id, commercial_id, montant, date_reglement')
      .in('type', ['remise', 'avance']).order('date_reglement', { ascending: false }).order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('clotures').select('id, commercial_id, created_at').eq('status', 'validee')
      .order('created_at').order('id').range(a, b)),
    supabase.from('solde_commercial').select('commercial_id, solde, statut, total_clotures, total_remises, total_avances'),
    supabase.from('commerciaux').select('id, nom, groupe_id, status'),
    supabase.from('groupes').select('id, nom').eq('archived', false).order('nom'),
    supabase.from('clotures').select('id, reference, net_final, created_at, commerciaux(nom)')
      .eq('status', 'validee').order('created_at', { ascending: false }).limit(5)
  ]);

  // Aplatit les lignes de vente (le client Supabase renvoie la clôture parente imbriquée)
  const lignes = (lignesBrutes as any[]).map((x) => {
    const c = Array.isArray(x.clotures) ? x.clotures[0] : x.clotures;
    const cm = Array.isArray(c?.commerciaux) ? c.commerciaux[0] : c?.commerciaux;
    return { article_nom: x.article_nom as string, montant: Number(x.montant), commission: Number(x.commission),
      commercial_id: c?.commercial_id as string, groupe_id: (cm?.groupe_id ?? null) as string | null };
  });

  return {
    du, au, groupe, article, lignes,
    clotures: clotures as any[], attributions: attributions as any[], reglements: reglements as any[],
    premieresClotures: premieres as any[], soldes: (s.data ?? []) as any[],
    commerciaux: (m.data ?? []) as any[], groupes: g.data ?? [], dernieres: (d.data ?? []) as any[]
  };
};
