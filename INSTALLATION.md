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
Chaque fonction est un **fichier unique** (`supabase/functions/<nom>/index.ts`) : collez-le tel quel dans l'éditeur du tableau de bord.
(Une première version importait des fichiers partagés et échouait avec « Module not found » dans l'éditeur ; ce n'est plus le cas.
Si vous modifiez `supabase/functions/_shared/`, relancez `python3 scripts/assembler_fonctions.py` pour régénérer les fichiers.)

Supabase > Edge Functions > « Deploy a new function » > **Via Editor** :
1. Champ **Function name** (en bas) : saisissez le nom **exact** du tableau ci-dessous. Le nom proposé par défaut (« clever-handler »,
   « dynamic-action »…) ne marcherait pas : l'application appelle la fonction par son nom.
2. Supprimez le code d'exemple, collez le contenu du fichier, cliquez **Deploy function**.
3. Une fois déployée : Edge Functions > la fonction > Details > **désactivez « Enforce JWT Verification »** si le tableau l'indique.

| Nom exact | Fichier | Désactiver la vérification JWT | À déployer maintenant ? |
|---|---|---|---|
| `inviter-membre` | `inviter-membre/index.ts` | oui (elle contrôle elle-même l'administrateur) | **oui** : invitations d'équipe et de commerciaux |
| `api-v1` | `api-v1/index.ts` | oui (clés `cp_…`, pas des jetons Supabase) | plus tard (plan Pro) |
| `envoyer-notifications` | `envoyer-notifications/index.ts` | oui (appelée par la base avec un secret) | plus tard (e-mails de notification, Resend) |
| `paiement-creer`, `paiement-verifier` | `…/index.ts` | non | à l'arrêt (paiement en pause) |
| `paiement-webhook` | `paiement-webhook/index.ts` | oui (FedaPay n'envoie pas de jeton) | à l'arrêt (paiement en pause) |

**Secrets** (Edge Functions > Secrets) : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà automatiquement. Ajoutez au besoin :
`CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` (notifications) ; `FEDAPAY_SECRET_KEY`, `FEDAPAY_ENV`, `SITE_URL` (paiement).

**Avec la CLI** (alternative) : `supabase functions deploy <nom>` (ajouter `--no-verify-jwt` pour les fonctions « oui » du tableau).

### Essayer les invitations sans paiement
Le plan Gratuit n'autorise qu'**1 membre d'équipe** (vous) : inviter un manager ou un comptable est refusé avec « Limite du plan atteinte ».
Inviter un **commercial** (portail) n'est pas limité. Pour tester une équipe, passez votre entreprise en Pro à la main (SQL Editor) :
```
update public.tenants set plan = 'pro', plan_renouvellement = current_date + 30 where email = 'votre@adresse.com';
```
Une invitation envoie un e-mail : l'envoi (Brevo) doit donc fonctionner. Sinon la fonction répond « Error sending invite email ».

## 6. Netlify
Le site est désormais **statique** : de simples fichiers servis par le réseau de Netlify, **sans fonction Netlify** (la page « Functions » de
Netlify doit rester vide). Il n'y a donc plus de « This function has crashed » ni d'« Inactivity Timeout » côté Netlify.
- Site configuration > Environment variables : `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
- Build command `npm run build`, Publish directory `build` (déjà fixés par `netlify.toml`).
- Puis Deploys > **Clear cache and deploy site** (les variables sont lues pendant la construction).

### « Un problème est survenu » à chaque lancement
Presque toujours une copie périmée de l'application gardée par le navigateur (service worker d'une ancienne version). L'application se répare
d'elle-même une fois ; sinon, bouton **Réinitialiser l'application** sur cet écran. À la main : Chrome > Paramètres du site >
Stockage > Effacer les données de `suivi-com.netlify.app`. Le message affiche maintenant la cause exacte entre parenthèses : envoyez-la-moi.

### Si l'application est lente ou n'ouvre pas
1. Ouvrez dans le navigateur `https://<votre-projet>.supabase.co/auth/v1/health` : une petite réponse JSON doit s'afficher en moins d'une seconde.
   Sinon le problème vient de Supabase, pas de l'application.
2. Supabase > page d'accueil du projet : le statut doit être « Healthy ». Les projets de l'offre gratuite sont **mis en pause après une période
   d'inactivité** : cliquez sur « Restore project » (la remise en route prend quelques minutes).
3. Netlify > Site configuration > Environment variables : l'adresse `PUBLIC_SUPABASE_URL` doit être celle du projet **actuel**
   (si vous avez recréé le projet Supabase, elle change, et il faut redéployer).
4. L'application affiche désormais « Le serveur met trop de temps à répondre » au bout de 30 secondes au lieu d'attendre sans fin.

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
