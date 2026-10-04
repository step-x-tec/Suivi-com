import { toutCharger } from '$lib/pagination';
import { periode } from '$lib/rapports';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase } = await parent();
  const defaut = periode('mois');
  const du = url.searchParams.get('du') ?? defaut.du;
  const au = url.searchParams.get('au') ?? defaut.au;

  const [clotures, attributions, g] = await Promise.all([
    toutCharger((a, b) => supabase.from('clotures')
      .select('id, commercial_id, created_at, brut, defauts, commissions, divers, net_final, commerciaux(nom, groupe_id)')
      .eq('status', 'validee')
      .gte('created_at', `${du}T00:00:00`).lte('created_at', `${au}T23:59:59.999`)
      .order('created_at').order('id').range(a, b)),
    toutCharger((a, b) => supabase.from('attributions')
      .select('id, commercial_id, nom, prix, qty_initial, qty_rest, commerciaux(nom, groupe_id)').order('id').range(a, b)),
    supabase.from('groupes').select('id, nom')
  ]);
  return { du, au, clotures: clotures as any[], attributions: attributions as any[], groupes: g.data ?? [] };
};
