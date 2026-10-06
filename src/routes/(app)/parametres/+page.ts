import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase, profil } = await parent();
  const [t, u, c, pay, cles] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', profil.tenant_id).maybeSingle(),
    supabase.from('users').select('id, nom, email, role').order('nom'),
    supabase.from('commerciaux').select('id, nom').eq('status', 'actif').order('nom'),
    supabase.from('paiements').select('id, plan, periode, montant, statut, created_at, plan_active_jusqu')
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('api_cles').select('id, nom, prefixe, created_at, derniere_utilisation, revoquee_at').order('created_at', { ascending: false })
  ]);
  return { tenant: t.data, utilisateurs: u.data ?? [], commerciaux: c.data ?? [], paiements: pay.data ?? [], cles: cles.data ?? [] };
};
