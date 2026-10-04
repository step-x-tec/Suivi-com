import { error } from '@sveltejs/kit';
import { chargerCompte } from '$lib/credit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { supabase } = await parent();
  const compte = await chargerCompte(supabase, params.id);
  if (!compte.c) error(404, 'Commercial introuvable');
  return compte;
};
