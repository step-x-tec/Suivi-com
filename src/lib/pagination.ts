// Supabase plafonne chaque réponse à 1000 lignes par défaut (même avec .limit(5000)) :
// sans pagination, un rapport sur une grosse période serait faux SANS message d'erreur.
// Les requêtes doivent être triées de façon stable (ex. .order('id')) pour que les pages ne se chevauchent pas.
export async function toutCharger<T>(
  page: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: any }>,
  taille = 1000, max = 20000
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < max; de += taille) {
    const { data, error } = await page(de, de + taille - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < taille) break;
  }
  return out;
}
