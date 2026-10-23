import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Site statique (SPA) : toutes les adresses renvoient vers index.html, l'application se charge dans le navigateur.
// La version affichée dans l'application (page de connexion, écran d'erreur) = les 7 premiers caractères de la livraison Netlify,
// ce qui permet de vérifier d'un coup d'œil QUELLE version tourne réellement. Elle est aussi lisible sur /_app/version.json.
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    version: { name: (process.env.COMMIT_REF ?? '').slice(0, 7) || String(Date.now()) }
  }
};
