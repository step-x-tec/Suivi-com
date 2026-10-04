import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const [{ data: soldes }, { count }] = await Promise.all([
    supabase.from('solde_commercial').select('solde, statut'),
    supabase.from('commerciaux').select('id', { count: 'exact', head: true }).eq('status', 'actif')
  ]);
  const lignes = soldes ?? [];
  return {
    totalDu: lignes.filter((s) => s.statut === 'debiteur').reduce((t, s) => t + Number(s.solde), 0),
    totalAPayer: lignes.filter((s) => s.statut === 'crediteur').reduce((t, s) => t - Number(s.solde), 0),
    debiteurs: lignes.filter((s) => s.statut === 'debiteur').length,
    nbCommerciaux: count ?? 0
  };
};
