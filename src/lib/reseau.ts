// Remplace l'erreur réseau brute par une réponse JSON lisible (code HORS_LIGNE) :
// supabase-js la transforme en { error: { code: 'HORS_LIGNE', message } } au lieu de lever une exception.
export function fetchTolerant(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await base(input, init);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e; // annulations (AbortError) : on laisse passer
      return new Response(
        JSON.stringify({ message: 'Pas de connexion : cette action nécessite internet.', code: 'HORS_LIGNE', details: null, hint: null }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
