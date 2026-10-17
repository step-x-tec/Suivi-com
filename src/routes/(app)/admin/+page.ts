import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Espace STEP-X : réservé aux comptes listés dans platform_admins. Le contrôle réel est dans la base (chaque fonction
// vérifie le droit) ; ce test ne sert qu'à afficher un message clair aux autres.
export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data: autorise } = await supabase.rpc('est_super_admin');
  if (autorise !== true) error(403, "Cet espace est réservé à l'équipe STEP-X.");
  const [e, p] = await Promise.all([supabase.rpc('admin_entreprises'), supabase.rpc('admin_paiements')]);
  if (e.error) error(500, e.error.message);
  return { entreprises: (e.data ?? []) as any[], paiements: (p.data ?? []) as any[] };
};
