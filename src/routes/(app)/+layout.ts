import { browser } from '$app/environment';
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

// Copie locale du profil : permet d'ouvrir l'application sans réseau (effacée à la déconnexion)
const CLE_LOCALE = 'commpro:profil';
type Local = { userId: string; profil: Profil; quota: Quota | null };
const lireLocal = (): Local | null => {
  try { return JSON.parse(localStorage.getItem(CLE_LOCALE) ?? 'null'); } catch { return null; }
};
const ecrireLocal = (l: Local) => {
  try { localStorage.setItem(CLE_LOCALE, JSON.stringify(l)); } catch { /* stockage plein ou indisponible */ }
};

export const load: LayoutLoad = async ({ parent, url }) => {
  const { supabase, session } = await parent();

  // Hors ligne avec une session expirée (impossible à renouveler sans réseau) : on reste dans l'application
  if (!session) {
    const local = browser && !navigator.onLine ? lireLocal() : null;
    if (local) return { profil: local.profil, quota: local.quota, userId: local.userId, horsLigneAuDemarrage: true };
    redirect(303, '/login');
  }

  const requete = () =>
    supabase.from('users')
      .select('role, nom, tenant_id, commercial_id, tenants(name, devise)')
      .eq('id', session.user.id).maybeSingle();

  let { data: profil, error: erreurProfil } = await requete();

  if (erreurProfil) {
    // Réseau coupé : on n'essaie surtout pas de créer une entreprise, on utilise la copie locale
    const local = browser ? lireLocal() : null;
    if (local && erreurProfil.code === 'HORS_LIGNE') {
      return { profil: local.profil, quota: local.quota, userId: local.userId, horsLigneAuDemarrage: true };
    }
    throw erreurProfil;
  }

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
  const q = quota as Quota | null;
  if (browser) ecrireLocal({ userId: session.user.id, profil: p, quota: q });
  return { profil: p, quota: q, userId: session.user.id, horsLigneAuDemarrage: false };
};
