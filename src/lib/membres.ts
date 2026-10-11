import type { SupabaseClient } from '@supabase/supabase-js';
import { invoquer } from './fonctions';

// Appelle l'Edge Function « inviter-membre ». Retourne un message d'erreur, ou null si tout va bien.
export async function appelerMembres(supabase: SupabaseClient, body: Record<string, unknown>): Promise<string | null> {
  return (await invoquer(supabase, 'inviter-membre', body)).erreur ?? null;
}
