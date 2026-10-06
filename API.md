# API CommPro (plans Pro et Business)

L'API permet à vos autres outils de lire vos données et d'enregistrer des clôtures.
Les clés se créent dans **Plus > Paramètres > Accès API** (administrateur). Une clé n'est affichée qu'une seule fois.

## Adresse et authentification
```
https://<votre-projet>.supabase.co/functions/v1/api-v1/<route>
Authorization: Bearer cp_...votre clé...
```
Toutes les réponses sont en JSON. Limite : **60 requêtes par minute et par clé** (sinon réponse 429).
Une clé donne accès aux données de **votre entreprise uniquement**. Elle est révoquée dès que vous la supprimez, ou si le plan repasse sous Pro.

## Routes
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/commerciaux` | Liste des commerciaux (`?status=actif|inactif`) |
| GET | `/attributions` | Attributions et stocks (`?commercial_id=<uuid>`) |
| GET | `/credit/soldes` | Solde de chaque commercial (positif = le commercial doit) |
| GET | `/rapports/resume` | Totaux des clôtures validées (`?du=AAAA-MM-JJ&au=AAAA-MM-JJ`, mois en cours par défaut) |
| POST | `/clotures` | Enregistre une clôture |

Les listes acceptent `?limit=` (1 à 200, 50 par défaut) et `?offset=`, et répondent
`{ "data": [...], "pagination": { "limit": 50, "offset": 0, "total": 123 } }`.

## Créer une clôture
```bash
curl -X POST "https://<projet>.supabase.co/functions/v1/api-v1/clotures" \
  -H "Authorization: Bearer cp_..." -H "Content-Type: application/json" \
  -d '{
    "commercial_id": "<uuid du commercial>",
    "method": "rest",
    "lines": [ { "attribution_id": "<uuid>", "saisie": 40, "defauts": 2 } ],
    "divers": [ { "label": "Déplacement", "montant": 1500 } ],
    "note": "Tournée du samedi"
  }'
```
- `method` : `"rest"` (vous envoyez les **restants**) ou `"vend"` (vous envoyez les **vendus**).
- `defauts` : articles défectueux, **inclus** dans les vendus ; ils sont déduits du net et remis en stock du commercial.
- Réponse `201` : `{ "data": { "id", "reference", "net_final", ... } }` avec le numéro de reçu `REC-AAAAMM-XXXX`.
- Le calcul est exactement celui de l'application (mêmes règles, mêmes limites du plan, même numérotation de reçu).
- Les clôtures créées par l'API sont attribuées au rôle « manager » (créer et clôturer, jamais supprimer).

## Erreurs
`400` requête invalide (le message dit quel champ) · `401` clé absente, invalide ou révoquée · `403` plan inférieur à Pro ·
`404` route inconnue · `405` mauvaise méthode · `422` règle métier refusée (stock insuffisant, limite du plan…) ·
`429` trop de requêtes · `500` erreur interne. Format : `{ "erreur": "message lisible" }`.
