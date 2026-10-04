import type { SupabaseClient } from '@supabase/supabase-js';

// Appelle l'Edge Function « inviter-membre ». Retourne un message d'erreur, ou null si tout va bien.
export async function appelerMembres(supabase: SupabaseClient, body: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.functions.invoke('inviter-membre', { body });
  if (!error) return null;
  try {
    const j = await (error as any).context.json();
    if (j?.erreur) return j.erreur as string;
  } catch { /* réponse non JSON */ }
  return error.message;
}
