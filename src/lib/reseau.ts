// Rend les erreurs réseau lisibles : au lieu de lever une exception, supabase-js reçoit une réponse JSON avec un code :
//   HORS_LIGNE : pas de connexion (503)        DELAI : le serveur n'a pas répondu à temps (504, 30 s par défaut)
export function fetchTolerant(base: typeof fetch, delaiMs = 30_000): typeof fetch {
  const reponse = (statut: number, message: string, code: string) =>
    new Response(JSON.stringify({ message, code, details: null, hint: null }),
      { status: statut, headers: { 'Content-Type': 'application/json' } });

  return async (input, init) => {
    const delai = AbortSignal.timeout(delaiMs);
    const signal = init?.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, delai]) : (init?.signal ?? delai);
    try {
      return await base(input, { ...init, signal });
    } catch (e) {
      if (init?.signal?.aborted) throw e; // annulation voulue par l'appelant : on la laisse remonter
      if (delai.aborted) return reponse(504, 'Le serveur met trop de temps à répondre. Réessayez dans un instant.', 'DELAI');
      if (!(e instanceof TypeError)) throw e;
      return reponse(503, 'Pas de connexion : cette action nécessite internet.', 'HORS_LIGNE');
    }
  };
}
