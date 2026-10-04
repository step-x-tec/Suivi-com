# CommPro v2 — STEP-X Technologies

SvelteKit 2 + Svelte 5 + Supabase. Mobile-first, PWA.

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner l'URL et la clé anon Supabase.
3. Supabase (SQL Editor) : exécuter dans l'ordre `001_commpro_core.sql`, `002_journal_triggers.sql`, `003_fk_users_set_null.sql`, `004_plans_quotas.sql`, `005_paiements.sql` (dossier `supabase/migrations`).
4. Supabase > Authentication > Hooks : activer *Custom Access Token* → `public.custom_access_token_hook`.
5. Invitations et portail commercial (voir section ci-dessous).
6. `npm run dev` · `npm test` · `npm run build` (déploiement Vercel).

## État
- [x] Schéma + RLS + clôture/annulation atomiques + vue des soldes + journal automatique
- [x] Auth, layout mobile/desktop, thème auto/sombre/clair
- [x] Accueil · Clôture · Reçu · Crédit & règlements · Relevé · Historique (annulation)
- [x] Groupes · Articles · Commerciaux (+ fiche) · Attributions (en masse, doublons, ±10)
- [x] Rapports (5 onglets, périodes, CSV, impression/PDF) · Journal · Paramètres (entreprise, sauvegarde JSON)
- [x] Portail commercial (articles, solde, reçus, relevé) · invitations par email · retrait d'accès · mot de passe oublié
- [x] Plans & quotas appliqués en base (commerciaux actifs, clôtures/mois, équipe) · export PDF réservé à Starter+
- [x] Paiement des abonnements Mobile Money via FedaPay (sandbox à tester avant le live)
- [ ] Offline/PWA · Excel · Notifications · API publique ← prochain

## Règle d'or
Les montants sont calculés **côté serveur** (`creer_cloture`). `src/lib/calc.ts` n'est qu'un aperçu
en direct, testé pour rester identique au SQL.

## Invitations et portail commercial (une seule fois)
1. Déployer la fonction : `supabase functions deploy inviter-membre` (réservée à l'admin, vérifiée côté serveur).
2. Supabase > Authentication > URL Configuration : *Site URL* = l'adresse de l'application (ex. `https://commpro.vercel.app`).
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
   `supabase secrets set FEDAPAY_SECRET_KEY=sk_sandbox_... FEDAPAY_ENV=sandbox SITE_URL=https://votre-app.vercel.app`
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
