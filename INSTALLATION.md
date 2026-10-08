# Installer CommPro v2 de zéro (ordre exact)

Compter environ 40 minutes. Ne sautez pas d'étape : chacune a causé un blocage réel pendant les essais.

## 0. Repartir proprement
- **Option A, recommandée** : créer un **nouveau projet Supabase**. Il faudra ensuite changer les deux clés dans Netlify (étape 7).
- **Option B** : garder le projet. Dans Authentication > Auth Hooks, **désactivez tous les hooks**, puis exécutez `supabase/reinitialisation.sql`
  (⚠ supprime toutes les données et tous les comptes).

## 1. Base de données
1. Database > Extensions : activer **pg_cron** et **pg_net**.
2. SQL Editor : coller **tout** `supabase/installation_complete.sql`, exécuter. Le script est exécuté d'un seul bloc : s'il s'arrête sur une erreur,
   **rien n'est installé à moitié**. Envoyez-moi le message d'erreur exact et la ligne.
3. SQL Editor : exécuter `supabase/verification.sql`. Les lignes 1 à 13 et 17 doivent commencer par ✓. Les lignes 14 à 16 sont informatives
   (la 15 indiquera « 1 sur 2 » tant que l'envoi d'e-mails n'est pas planifié).

## 2. Hooks d'authentification : n'en activer AUCUN
Authentication > **Auth Hooks** : tous les hooks doivent être **désactivés** (Customize Access Token, **Send Email**, etc.).
L'application n'en a pas besoin : elle lit l'entreprise et le rôle de chaque personne dans la base. Un hook « Send Email » actif empêche
Supabase d'envoyer le moindre e-mail, et un hook de jeton mal réglé bloque la connexion.

## 3. Authentification
- Authentication > URL Configuration : **Site URL** `https://suivi-com.netlify.app` ; **Redirect URLs** : ajouter `https://suivi-com.netlify.app/**`.
- Authentication > Sign In / Providers > Email : « Confirm email » **désactivé pendant les essais**, à **activer avant d'ouvrir à de vrais utilisateurs**.
- Authentication > Password : longueur minimale **8** (ou plus).

## 4. Envoi des e-mails (SMTP)
Authentication > Emails > SMTP Settings (Brevo) : activer le SMTP personnalisé.
- Hôte `smtp-relay.brevo.com` · port `587` · identifiant `xxxxx@smtp-brevo.com` · mot de passe = **clé SMTP** (`xsmtpsib-…`, pas la clé API) ·
  adresse d'expédition = celle **vérifiée** chez Brevo.
- Brevo : compte validé, SMTP activé (page SMTP & API), « Adresses IP autorisées » désactivé.
- Authentication > Rate Limits : relever la limite d'e-mails par heure.
- Authentication > Emails > Templates : coller les 3 liens du README (confirmation, invitation, réinitialisation).
- **Test** : « Mot de passe oublié » sur la page de connexion, puis vérifier Brevo > Transactionnel > Email > Logs.

## 5. Fonctions serveur (Edge Functions)
Avec la CLI Supabase connectée au nouveau projet (`supabase login`, `supabase link --project-ref <ref>`) :
```
supabase functions deploy inviter-membre
supabase functions deploy api-v1 --no-verify-jwt
supabase functions deploy envoyer-notifications --no-verify-jwt
supabase secrets set CRON_SECRET=<long mot de passe au hasard> RESEND_API_KEY=re_... EMAIL_FROM="CommPro <adresse@votredomaine>" SITE_URL=https://suivi-com.netlify.app
```
(Les e-mails de notification utilisent Resend : sans domaine vérifié, ne déployez pas `envoyer-notifications` pour l'instant ; l'application fonctionne sans.)
Les fonctions `paiement-*` (FedaPay) restent à l'arrêt : ne pas les déployer tant que le paiement n'est pas repris.

## 6. Netlify
Site configuration > Environment variables : `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
Puis Deploys > **Clear cache and deploy site** (les variables sont lues pendant la construction).

## 7. Premier essai (dans cet ordre)
1. Créer un compte depuis la page d'inscription → vous arrivez sur le tableau de bord (si « Confirm email » est actif : confirmer d'abord).
2. Plus > Paramètres : le nom de l'entreprise apparaît.
3. Créer un groupe, un article, un commercial, puis une attribution (Plus > …).
4. Clôture : choisir le commercial, saisir restants et défauts, confirmer → le reçu s'affiche avec un numéro `REC-AAAAMM-0001`.
5. Crédit : le solde du commercial apparaît ; enregistrer une remise ; ouvrir le relevé.
6. Rapports : exporter en Excel ; Historique : annuler la clôture (le stock revient).
7. Notifications : la cloche affiche les événements.
8. (Plan Gratuit) créer un 4e commercial → doit être **refusé** avec un message sur la limite du plan.
9. Mode avion : rouvrir l'application, enregistrer un règlement, désactiver le mode avion → il part tout seul.
En cas d'écran d'erreur : lisez le message, il indique la cause (profil introuvable, création de l'entreprise refusée…).
