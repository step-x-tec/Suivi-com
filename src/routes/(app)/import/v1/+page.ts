import type { PageLoad } from './$types';

// Compte « vide » exigé par l'import : on prévient avant que l'utilisateur ne choisisse son fichier
export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const tables = ['groupes', 'articles', 'commerciaux', 'attributions', 'clotures', 'reglements'] as const;
  const comptes = await Promise.all(
    tables.map((t) => supabase.from(t).select('id', { count: 'exact', head: true })));
  const present = tables
    .map((t, i) => ({ t, n: comptes[i].count ?? 0 }))
    .filter((x) => x.n > 0);
  return { present };
};
