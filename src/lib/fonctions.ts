import type { SupabaseClient } from '@supabase/supabase-js';

// Appelle une Edge Function. Retourne { data } ou { erreur } (message lisible, jamais d'exception).
export async function invoquer<T = unknown>(
  supabase: SupabaseClient, nom: string, body: Record<string, unknown>
): Promise<{ data?: T; erreur?: string }> {
  const { data, error } = await supabase.functions.invoke(nom, { body });
  if (!error) return { data: data as T };
  try {
    const j = await (error as any).context.json();
    if (j?.erreur) return { erreur: j.erreur as string };
  } catch { /* réponse non JSON */ }
  return { erreur: error.message };
}
