// File d'attente hors ligne (IndexedDB). Seules les actions SANS risque de conflit y entrent :
// les règlements, qui sont de simples ajouts (identifiant généré sur le téléphone => envoi idempotent).
// Les clôtures restent en ligne : elles dépendent du stock réel et du numéro de reçu côté serveur.
export interface Action {
  id: string;
  user_id: string;
  table: 'reglements';
  payload: Record<string, unknown>;
  created_at: string;
  erreur?: string; // refusée par le serveur : conservée pour que l'utilisateur la voie
}
export type Resultat = { ok: true } | { reseau: true } | { erreur: string };

// Envoie les actions dans l'ordre. Réseau coupé : on s'arrête (reprise plus tard).
// Refus du serveur : l'action est marquée et ne bloque pas les suivantes.
export async function traiter(
  actions: Action[],
  envoyer: (a: Action) => Promise<Resultat>,
  sortie: { supprimer: (id: string) => Promise<void>; refuser: (id: string, erreur: string) => Promise<void> }
) {
  let envoyes = 0, refuses = 0, reseau = false;
  const aFaire = actions.filter((a) => !a.erreur).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of aFaire) {
    const r = await envoyer(a);
    if ('ok' in r) { await sortie.supprimer(a.id); envoyes++; }
    else if ('reseau' in r) { reseau = true; break; }
    else { await sortie.refuser(a.id, r.erreur); refuses++; }
  }
  return { envoyes, refuses, reseau };
}

// ---- Stockage IndexedDB (navigateur uniquement) ----
const DB = 'commpro-hors-ligne', STORE = 'actions';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir();
  return new Promise<T>((res, rej) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { res(req.result); db.close(); };
    req.onerror = () => { rej(req.error); db.close(); };
  });
}

export const ajouterAction = (a: Action) => tx('readwrite', (s) => s.put(a)).then(() => undefined);
export const listerActions = () => tx<Action[]>('readonly', (s) => s.getAll());
export const supprimerAction = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);
export const viderActions = () => tx('readwrite', (s) => s.clear()).then(() => undefined);
export async function marquerRefus(id: string, erreur: string) {
  const a = await tx<Action | undefined>('readonly', (s) => s.get(id));
  if (a) await ajouterAction({ ...a, erreur });
}
