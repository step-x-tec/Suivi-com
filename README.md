# CommPro v2 — STEP-X Technologies

SvelteKit 2 + Svelte 5 + Supabase. Mobile-first, PWA.

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner l'URL et la clé anon Supabase.
3. Supabase (SQL Editor) : exécuter dans l'ordre `001_commpro_core.sql`, `002_journal_triggers.sql`, `003_fk_users_set_null.sql`, `004_plans_quotas.sql`, `005_paiements.sql` (dossier `supabase/migrations`).
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
- [ ] Excel · Notifications · Tableau de bord complet (graphiques) · Import CSV · API publique ← prochain

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
