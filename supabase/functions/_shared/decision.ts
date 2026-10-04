// Décision pure (testable) : que faire d'une transaction FedaPay par rapport à notre paiement ?
// On ne fait JAMAIS confiance au contenu du webhook : le statut vient de l'API FedaPay (appel
// authentifié par notre clé secrète), et le montant et la devise doivent correspondre.
export type Action = 'activer' | 'refuser' | 'annuler' | 'attendre' | 'anomalie';

export function decider(
  t: any, p: { montant: number | string; devise: string }
): { action: Action; raison?: string } {
  const statut = String(t?.status ?? '').toLowerCase();

  if (statut === 'approved' || statut === 'transferred') {
    const recu = Number(t?.amount);
    const iso = String(t?.currency?.iso ?? t?.currency_iso ?? 'XOF').toUpperCase();
    if (recu !== Number(p.montant)) return { action: 'anomalie', raison: `Montant reçu ${recu} différent du montant attendu ${p.montant}` };
    if (iso !== p.devise.toUpperCase()) return { action: 'anomalie', raison: `Devise reçue ${iso} différente de ${p.devise}` };
    return { action: 'activer' };
  }
  if (statut === 'declined') return { action: 'refuser' };
  if (statut === 'canceled' || statut === 'cancelled' || statut === 'refunded') return { action: 'annuler' };
  return { action: 'attendre' };
}
