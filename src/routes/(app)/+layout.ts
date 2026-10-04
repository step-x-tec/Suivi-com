import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

type Profil = {
  role: 'admin' | 'manager' | 'comptable' | 'commercial';
  nom: string | null;
  tenant_id: string;
  commercial_id: string | null;
  tenants: { name: string; devise: string };
};

export type Quota = {
  plan: string; plan_souscrit: string; renouvellement: string | null; expire: boolean; jours_restants: number | null;
  limites: { commerciaux: number | null; clotures_mois: number | null; equipe: number | null; export_pdf: boolean; api: boolean };
  usage: { commerciaux: number; clotures_mois: number; equipe: number };
};

export const load: LayoutLoad = async ({ parent, url }) => {
  const { supabase, session } = await parent();
  if (!session) redirect(303, '/login');

  const requete = () =>
    supabase.from('users')
      .select('role, nom, tenant_id, commercial_id, tenants(name, devise)')
      .eq('id', session.user.id).maybeSingle();

  let { data: profil } = await requete();

  // Premier passage : on crée l'entreprise à partir des infos saisies à l'inscription
  if (!profil) {
    const m = session.user.user_metadata ?? {};
    const { error } = await supabase.rpc('inscrire_entreprise', {
      p_entreprise: m.entreprise ?? 'Mon entreprise',
      p_nom: m.nom ?? session.user.email,
      p_phone: m.phone ?? null,
      p_pays: m.pays ?? null,
      p_devise: m.devise ?? 'CFA'
    });
    if (error) throw error;
    await supabase.auth.refreshSession(); // récupère tenant_id / rôle dans le JWT
    ({ data: profil } = await requete());
  }
  const p = profil as unknown as Profil;
  // Le commercial n'accède qu'à son portail, à ses reçus et à son relevé
  if (p.role === 'commercial' && !['/portail', '/recu/', '/credit/'].some((x) => url.pathname.startsWith(x))) {
    redirect(303, '/portail');
  }
  const { data: quota } = await supabase.rpc('usage_plan');
  return { profil: p, quota: quota as Quota | null };
};
