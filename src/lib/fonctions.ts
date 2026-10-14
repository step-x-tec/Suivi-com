import type { SupabaseClient } from '@supabase/supabase-js';

// Message lisible pour une réponse d'erreur d'une fonction serveur (Edge Function).
// Le message de supabase-js (« Edge Function returned a non-2xx status code ») ne dit jamais POURQUOI : on lit le statut et le corps.
export function messageFonction(statut: number | undefined, corps: any, defaut: string): string {
  if (typeof corps?.erreur === 'string') return corps.erreur;                    // erreur métier renvoyée par nos fonctions
  if ((corps?.code === 'HORS_LIGNE' || corps?.code === 'DELAI') && typeof corps?.message === 'string') return corps.message;
  if (statut === 404) return "Cette fonction n'est pas installée sur le serveur (Supabase > Edge Functions). Voir INSTALLATION.md, étape 5.";
  if (statut === 401) return 'Accès refusé par le serveur. Reconnectez-vous ; si cela persiste, redéployez la fonction avec l\'option --no-verify-jwt.';
  if (statut === 403) return 'Action refusée pour votre compte.';
  if (statut === 429) return 'Trop de requêtes : patientez un instant avant de réessayer.';
  if (statut !== undefined && statut >= 500) return `Erreur du serveur (${statut}). Réessayez ; si cela persiste, consultez les journaux de la fonction dans Supabase.`;
  if (typeof corps?.message === 'string') return corps.message;
  return defaut;
}

// Appelle une Edge Function. Retourne { data } ou { erreur } (message lisible, jamais d'exception).
export async function invoquer<T = unknown>(
  supabase: SupabaseClient, nom: string, body: Record<string, unknown>
): Promise<{ data?: T; erreur?: string }> {
  const { data, error } = await supabase.functions.invoke(nom, { body });
  if (!error) return { data: data as T };
  const ctx = (error as { context?: unknown }).context as { status?: number; json?: () => Promise<unknown> } | undefined;
  if (typeof ctx?.status !== 'number') {
    return { erreur: `Impossible de joindre la fonction « ${nom} » : vérifiez votre connexion internet.` };
  }
  let corps: unknown = null;
  try { corps = await ctx.json?.(); } catch { /* corps non JSON */ }
  return { erreur: messageFonction(ctx.status, corps, error.message) };
}
