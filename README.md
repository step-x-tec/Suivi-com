# CommPro v2 — STEP-X Technologies

SvelteKit 2 + Svelte 5 + Supabase. Mobile-first, PWA.

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner l'URL et la clé anon Supabase.
3. Supabase (SQL Editor) : exécuter dans l'ordre `001_commpro_core.sql`, `002_journal_triggers.sql`, `003_fk_users_set_null.sql`, `004_plans_quotas.sql`, `005_paiements.sql`, `006_notifications.sql`, `007_alignement_v1_et_import.sql` (dossier `supabase/migrations`).
4. Supabase > Authentication > Hooks : activer *Custom Access Token* → `public.custom_access_token_hook`.
5. Invitations et portail commercial (voir section ci-dessous).
6. `npm run dev` · `npm test` · `npm run build` (déploiement Netlify, voir ci-dessous).

## État
- [x] Schéma + RLS + clôture/annulation atomiques + vue des soldes + journal automatique
- [x] Auth, layout mobile/desktop, thème auto/sombre/clair
- [x] Accueil · Clôture · Reçu · Crédit & règlements · Relevé · Historique (annulation)
- [x] Groupes · Articles · Commerciaux (+ fiche) · Attributions (en masse, doublons, ±10)
- [x] Rapports (5 onglets, périodes, CSV, impression/PDF) · Journal · Paramètres (entreprise, sauvegarde JSON)
- [x] Portail commercial (articles, solde, reçus, relevé) · invitations par email · retrait d'accès · mot de passe oublié
- [x] Plans & quotas appliqués en base (commerciaux actifs, clôtures/mois, équipe) · export PDF réservé à Starter+
- [x] Paiement des abonnements Mobile Money via FedaPay (sandbox à tester avant le live)
- [x] Mode hors ligne (application installable, consultation, règlements en file d'attente)
- [x] Tableau de bord complet (KPIs, jauge de recouvrement, ventes par commercial, ventes et commissions par groupe, anneau des articles, courbe 30 jours, carte de chaleur 12 semaines, débiteurs, alertes, filtres période / groupe / article)
- [x] Chargement paginé (Supabase plafonne à 1000 lignes par réponse) sur le tableau de bord et les rapports
- [x] Import CSV des commerciaux, articles et groupes (modèle téléchargeable, aperçu, contrôle des doublons et du quota du plan)
- [x] Notifications dans l'application (cloche, messages en direct, alertes stock bas et retards)
- [x] Calcul de clôture aligné sur le prototype v1 (défauts inclus dans les vendus, déduits du net, remis en stock) + test de fidélité
- [x] Import des données du prototype v1 (JSON) : groupes, articles, commerciaux, attributions, clôtures, règlements
- [x] Export Excel (.xlsx) sans dépendance : rapports (une feuille par onglet) et historique des clôtures
- [ ] E-mail et push · API publique ← prochain

## Règle d'or
Les montants sont calculés **côté serveur** (`creer_cloture`). `src/lib/calc.ts` n'est qu'un aperçu
en direct, testé pour rester identique au SQL.

## Invitations et portail commercial (une seule fois)
1. Déployer la fonction : `supabase functions deploy inviter-membre` (réservée à l'admin, vérifiée côté serveur).
2. Supabase > Authentication > URL Configuration : *Site URL* = l'adresse de l'application (ex. `https://suivi-com.netlify.app`).
3. Supabase > Authentication > Email Templates : remplacer le lien dans chaque modèle par :
   - **Invite user** : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/bienvenue`
   - **Reset password** : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/bienvenue`
   - **Confirm signup** : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`
4. Utilisation : Plus > Paramètres > Inviter un membre, ou bouton « Inviter au portail » sur la fiche d'un commercial (email requis).
   Le commercial choisit son mot de passe puis ne voit que ses propres données.

## Plans — changement manuel (secours)
En cas de besoin (geste commercial, paiement hors ligne), dans le SQL Editor :
`update public.tenants set plan = 'pro', plan_renouvellement = current_date + 30 where id = '<uuid>';`
Un administrateur ne peut pas modifier son propre plan depuis l'application (droit retiré en base).

## Paiement des abonnements (FedaPay)
Opérateurs Togo pris en charge par FedaPay : Mixx by Yas (ex T-Money) et Moov (Flooz). Wave n'est pas proposé par FedaPay.
1. Créer un compte FedaPay, travailler d'abord en **sandbox**, récupérer la clé secrète.
2. Secrets Supabase :
   `supabase secrets set FEDAPAY_SECRET_KEY=sk_sandbox_... FEDAPAY_ENV=sandbox SITE_URL=https://suivi-com.netlify.app`
3. Déployer :
   `supabase functions deploy paiement-creer` · `supabase functions deploy paiement-verifier` ·
   `supabase functions deploy paiement-webhook --no-verify-jwt`
4. Dans FedaPay > Webhooks : URL `https://<projet>.supabase.co/functions/v1/paiement-webhook`, événements
   `transaction.approved`, `transaction.declined`, `transaction.canceled`.
5. Tester un paiement complet en sandbox (voir la liste de contrôle ci-dessous), puis passer en live :
   clé live + `FEDAPAY_ENV=live` + nouveau webhook live.

**À contrôler au premier essai sandbox** (le code suit la documentation FedaPay mais n'a pas encore tourné contre leur API) :
- le bouton « Choisir » redirige vers la page de paiement FedaPay ;
- après paiement, la page de retour affiche « Paiement reçu » et le plan change dans Paramètres ;
- un paiement refusé laisse le plan inchangé ;
- renvoyer le même webhook deux fois (bouton *Redeliver* de FedaPay) ne prolonge pas la période deux fois.
Si l'étape 1 échoue, regarder les journaux de la fonction `paiement-creer` : seule la forme de la réponse de l'API serait à ajuster
(`extraire()` dans `supabase/functions/_shared/fedapay.ts`).

**Sécurité** : le plan n'est activé que par la base (`activer_plan`, réservée au service role) après relecture du statut réel de la
transaction chez FedaPay, avec contrôle du montant et de la devise. Un faux webhook ne peut donc rien activer.
Un abonnement non renouvelé repasse aux limites du plan Gratuit 3 jours après l'échéance (données conservées).

## Mode hors ligne
**Ce qui fonctionne sans réseau** : ouvrir l'application installée, consulter les écrans déjà visités (commerciaux, attributions,
crédit, reçus, relevés), et **enregistrer un règlement** (remise, avance…). Les règlements saisis hors ligne sont gardés sur le
téléphone, comptés tout de suite dans le solde affiché (marqués « en attente d'envoi »), puis envoyés automatiquement au retour du
réseau. Chaque règlement a un identifiant créé sur le téléphone : un renvoi ne peut jamais le dupliquer.

**Ce qui reste en ligne** : les clôtures (le serveur vérifie le stock réel et attribue le numéro de reçu), les attributions, les
créations et modifications de fiches, le paiement. L'application l'indique clairement ; les saisies d'une clôture restent à l'écran.

**Si le serveur refuse une action** (ex. droits retirés entre-temps) : bandeau rouge, puis écran *Synchronisation* pour réessayer ou
abandonner. À la déconnexion, on prévient s'il reste des actions non envoyées, et les données en cache sont effacées.

**Limites connues** : seuls les écrans consultés au moins une fois en ligne sont disponibles hors ligne (l'application en précharge les
principaux 4 secondes après l'ouverture) ; les données affichées sont celles de la dernière connexion.

**À tester sur un vrai téléphone avant de compter dessus** (non essayé dans un navigateur) :
1. Ouvrir l'application en ligne, attendre 10 secondes, installer (« Ajouter à l'écran d'accueil »).
2. Passer en mode avion, rouvrir l'application : le bandeau « Hors ligne » apparaît, la fiche d'un commercial s'affiche.
3. Enregistrer un règlement : il apparaît en pointillés, le solde bouge.
4. Désactiver le mode avion : le règlement part seul (bandeau « en cours d'envoi » puis disparition) et apparaît normalement.
5. Attendre plus d'une heure hors ligne puis rouvrir : l'application doit rester ouverte (session expirée localement).

## Déploiement sur Netlify
- Le **contenu du dossier** (là où se trouvent `package.json`, `netlify.toml`, `src/`, `supabase/`) doit être à la **racine** du dépôt GitHub, pas dans un sous-dossier.
- Node 22 est imposé par `.nvmrc` et `netlify.toml` (Node 24 est refusé).
- Netlify > Site configuration > Environment variables : ajouter `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY`
  **avant** le déploiement (elles sont lues pendant la construction ; sans elles le build échoue).
- Si Netlify répond « Unable to access repository » : Site configuration > Build & deploy > Continuous deployment >
  Link repository, et vérifier que l'application GitHub Netlify a accès au dépôt `step-x-tec/Suivi-com`
  (GitHub > Settings > Applications > Netlify > Repository access).

## Import CSV
Plus > Importer des données (ou le lien en haut des listes). Choisir le type, télécharger le modèle si besoin, charger le fichier.
- Lecture : séparateur détecté (`;` `,` tabulation), UTF-8 ou Windows-1252 (CSV d'Excel français), nombres « 1 500 », « 10 % », « 500 FCFA ».
- Colonnes reconnues automatiquement (accents et variantes : « Téléphone », « Tel », « Nom complet »…), modifiables avant l'import.
- Les lignes en erreur sont listées avec leur numéro et **ne sont pas importées** ; les autres le sont.
- Doublons : identifiés par le **code** (ou le nom pour les groupes). Au choix, ignorés ou mis à jour (une cellule vide ne modifie jamais une fiche existante).
- Le quota du plan est vérifié avant d'écrire quoi que ce soit.
- Import par lots de 200 : si une erreur survient en cours de route, relancer avec « ignorer les existants » termine sans rien dupliquer
  (uniquement pour les lignes ayant un **code** : sans code, une relance recrée la ligne).
- Chaque ligne créée apparaît dans le journal d'activité.

## Notifications
Cloche en haut de chaque écran (nombre de non lues) + message qui s'affiche en direct quand un événement arrive.
- Nouvelle attribution / stock ajouté → le commercial (s'il a un accès au portail).
- Clôture validée ou annulée, règlement enregistré → le commercial et les administrateurs (sauf celui qui a fait l'action).
- Stock bas (il reste 10 % ou moins, lots d'au moins 10) → administrateurs, une seule fois au franchissement du seuil.
- Débiteur sans règlement depuis plus de 30 jours → administrateurs, rappel quotidien (au plus un par semaine et par commercial).
À faire une fois : Supabase > Database > Extensions > activer **pg_cron** AVANT d'exécuter `006_notifications.sql`
(sinon le rappel quotidien n'est pas planifié ; on peut le planifier ensuite : `select cron.schedule('alertes-retard','0 7 * * *','select public.alertes_retard()');`).
Le temps réel utilise Supabase Realtime (la migration ajoute la table à la publication). **Pas encore fait** : e-mail et notification push
(il faut choisir un service d'envoi), et les préférences de fréquence.

## Calcul de clôture (identique au prototype v1)
Pour chaque article : **vendus** = restants avant − restants saisis (ou vendus saisis) ; **vendus valides** = vendus − défauts ;
**brut** = vendus × prix ; commission et « dû » ne portent que sur les vendus valides ; les **défauts** (défauts × prix) sont déduits ;
**net** = brut − commissions − défauts − divers ; après clôture, **stock = restants + défauts** (les articles défectueux reviennent au commercial).
Un test compare ce calcul au code du prototype sur 500 cas aléatoires. Seule différence : le net n'est **pas plafonné à 0**
(dans le v1, `Math.max(0, …)` faisait perdre l'excédent de déductions) ; un excédent est ici crédité au commercial dans son compte.
Le solde du crédit suit exactement la formule du v1 : clôtures − remises/avances + frais − retours ± ajustements.

## Import depuis le prototype v1
Plus > Importer des données > « Vous venez du prototype CommPro v1 ? » (administrateur, **compte vide** uniquement).
Dans le prototype : bouton « ↓ JSON ». L'import est tout ou rien (une seule transaction) : si une ligne pose problème, rien n'est écrit.
Les clôtures gardent leurs montants et reçoivent de nouveaux numéros REC-AAAAMM-XXXX dans l'ordre chronologique ; l'historique est importé sans
journal ni notification par ligne et sans limite mensuelle. Les quotas de commerciaux actifs du plan s'appliquent.

## Export Excel
Rapports > « Excel (tous les onglets) » : un classeur avec une feuille par onglet (Résumé, Ventes, Commissions, Attributions, Inventaire).
Historique > « Excel » : la liste filtrée des clôtures. Le fichier est généré dans le navigateur, sans bibliothèque externe
(archive ZIP + XML, en-têtes en gras, première ligne figée, nombres au format #,##0). Contrôlé en le relisant avec openpyxl et en l'ouvrant avec LibreOffice.
