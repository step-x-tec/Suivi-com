import { error, redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

// L'application connectée n'a pas besoin de rendu serveur (données privées, application installable) : tout
// s'exécute dans le navigateur. C'est le seul endroit où l'on peut renouveler la session ET enregistrer ses cookies.
// (Avant : le rendu serveur créait l'entreprise puis ne pouvait pas sauvegarder le nouveau jeton -> page d'erreur
// au premier chargement après confirmation de l'adresse e-mail.)
export const ssr = false;

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

  // Sans réseau et session expirée (impossible à renouveler) : on reste dans l'application
  if (!session) {
    const local = !navigator.onLine ? lireLocal() : null;
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
    const local = lireLocal();
    if (local && erreurProfil.code === 'HORS_LIGNE') {
      return { profil: local.profil, quota: local.quota, userId: local.userId, horsLigneAuDemarrage: true };
    }
    error(500, `Impossible de charger votre profil : ${erreurProfil.message}`);
  }

  // Premier passage : on crée l'entreprise à partir des infos saisies à l'inscription
  if (!profil) {
    const m = session.user.user_metadata ?? {};
    const { error: errInscription } = await supabase.rpc('inscrire_entreprise', {
      p_entreprise: m.entreprise ?? 'Mon entreprise',
      p_nom: m.nom ?? session.user.email,
      p_phone: m.phone ?? null,
      p_pays: m.pays ?? null,
      p_devise: m.devise ?? 'CFA'
    });
    if (errInscription) error(500, `Création de l'entreprise impossible : ${errInscription.message}`);
    ({ data: profil } = await requete());
    if (!profil) error(500, "Votre compte a été créé mais reste introuvable : rechargez la page.");
  }

  const p = profil as unknown as Profil;

  // Le commercial n'accède qu'à son portail, à ses reçus, à son relevé et à ses notifications
  if (p.role === 'commercial' && !['/portail', '/recu/', '/credit/', '/notifications'].some((x) => url.pathname.startsWith(x))) {
    redirect(303, '/portail');
  }

  const { data: quota } = await supabase.rpc('usage_plan');
  const q = quota as Quota | null;
  ecrireLocal({ userId: session.user.id, profil: p, quota: q });
  return { profil: p, quota: q, userId: session.user.id, horsLigneAuDemarrage: false };
};
