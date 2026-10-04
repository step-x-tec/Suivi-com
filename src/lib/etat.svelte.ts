import type { SupabaseClient } from '@supabase/supabase-js';
import { listerActions, marquerRefus, supprimerAction, traiter, type Resultat } from './file-attente';

// État réseau partagé par toute l'application (Svelte 5 : objet réactif de module)
export const etat = $state({ enLigne: true, enAttente: 0, refuses: 0, synchro: false, nonLues: 0, toast: '' });

export async function rafraichir() {
  try {
    const a = await listerActions();
    etat.enAttente = a.filter((x) => !x.erreur).length;
    etat.refuses = a.filter((x) => x.erreur).length;
  } catch { /* IndexedDB indisponible (navigation privée) : on reste en ligne uniquement */ }
}

export async function synchroniser(supabase: SupabaseClient, userId: string) {
  if (etat.synchro || !navigator.onLine) return;
  etat.synchro = true;
  try {
    const actions = (await listerActions()).filter((a) => a.user_id === userId);
    await traiter(
      actions,
      async (a): Promise<Resultat> => {
        // upsert + ignoreDuplicates = INSERT ... ON CONFLICT DO NOTHING : renvoyer deux fois ne duplique rien
        const { error } = await supabase.from(a.table).upsert(a.payload, { onConflict: 'id', ignoreDuplicates: true });
        if (!error) return { ok: true };
        if (error.code === 'HORS_LIGNE') return { reseau: true };
        return { erreur: error.message };
      },
      { supprimer: supprimerAction, refuser: marquerRefus }
    );
  } catch (e) {
    console.error('Synchronisation interrompue', e);
  } finally {
    etat.synchro = false;
    await rafraichir();
  }
}

// À appeler une fois au chargement de l'application connectée ; retourne la fonction d'arrêt.
export function demarrer(supabase: SupabaseClient, userId: string): () => void {
  etat.enLigne = navigator.onLine;
  const enLigne = () => { etat.enLigne = true; synchroniser(supabase, userId); chargerNonLues(supabase); };
  const horsLigne = () => { etat.enLigne = false; };
  window.addEventListener('online', enLigne);
  window.addEventListener('offline', horsLigne);
  const minuteur = setInterval(() => { if (etat.enAttente > 0) synchroniser(supabase, userId); }, 30_000);
  rafraichir().then(() => synchroniser(supabase, userId));
  return () => {
    window.removeEventListener('online', enLigne);
    window.removeEventListener('offline', horsLigne);
    clearInterval(minuteur);
  };
}

// ---- Notifications : compteur de non lues + messages reçus en direct (Supabase Realtime) ----
export async function chargerNonLues(supabase: SupabaseClient) {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
  if (!error && count !== null) etat.nonLues = count;
}

export function ecouterNotifications(supabase: SupabaseClient, userId: string): () => void {
  chargerNonLues(supabase);
  const canal = supabase
    .channel(`notifications-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (p) => {
        const message = String((p.new as { message?: string }).message ?? '');
        etat.nonLues += 1;
        etat.toast = message;
        setTimeout(() => { if (etat.toast === message) etat.toast = ''; }, 6000);
      })
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}
