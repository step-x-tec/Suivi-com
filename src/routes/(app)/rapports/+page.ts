import { periode } from '$lib/rapports';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase } = await parent();
  const defaut = periode('mois');
  const du = url.searchParams.get('du') ?? defaut.du;
  const au = url.searchParams.get('au') ?? defaut.au;

  const [k, a, g] = await Promise.all([
    supabase.from('clotures')
      .select('id, commercial_id, created_at, brut, commissions, divers, net_final, commerciaux(nom, groupe_id)')
      .eq('status', 'validee')
      .gte('created_at', `${du}T00:00:00`).lte('created_at', `${au}T23:59:59.999`).limit(5000),
    supabase.from('attributions')
      .select('commercial_id, nom, prix, qty_initial, qty_rest, commerciaux(nom, groupe_id)').limit(5000),
    supabase.from('groupes').select('id, nom')
  ]);
  if (k.error) throw k.error;
  return { du, au, clotures: (k.data ?? []) as any[], attributions: (a.data ?? []) as any[], groupes: g.data ?? [] };
};
