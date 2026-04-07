HALLILA : C KI KIA LA — version finale GitHub Pages + Supabase sécurisé

Contenu
- index.html
- styles.css
- app.js
- supabase-config.js
- schema.sql
- bg-music.wav (optionnel si tu veux garder la musique)

Cette version est pensée pour être déployée à la racine du repo GitHub puis servie par GitHub Pages.
Elle garde le live de partie via PeerJS, relie les comptes / profils / sets / historique à Supabase, et ajoute une couche de sécurité BDD avec RLS + policies.

Ce qui est inclus
- création de compte reliée à Supabase Auth
- vérification d’e-mail avec redirection vers GitHub Pages
- récupération de mot de passe avec redirection vers GitHub Pages
- gestion du retour de vérification / récupération directement dans l’app
- historique public en lecture
- profils, sets, rooms et synchro protégés par RLS
- reprise admin par admin_token + live_state_json
- reconnexion joueur automatique si la connexion temps réel tombe
- avertissement clair si le lien partagé pointe vers localhost / une adresse locale

Déploiement GitHub Pages
1. Mets ces fichiers à la racine du repo.
2. Vérifie que GitHub Pages sert bien la branche main / root.
3. Garde dans supabase-config.js :
   - l’URL Supabase
   - la clé publishable / anon
   - la vraie URL publique GitHub Pages dans siteUrl
4. Dans Supabase, exécute le schema.sql fourni dans SQL Editor.
5. Dans Supabase > Authentication > URL Configuration :
   - Site URL = https://davidb2208.github.io/HALLILA-KI-C-KIALA/
   - ajoute aussi cette URL dans Redirect URLs
6. Vérifie que le provider Email est activé.
7. Teste le site uniquement via l’URL publique GitHub Pages, pas via localhost.

BDD / sécurité
- Le schema.sql active maintenant RLS sur les tables publiques.
- Les profils utilisateur sont privés : chacun ne voit / modifie que sa ligne users.
- Les rooms et leur synchro BDD sont réservées à l’hôte authentifié.
- Les sets privés restent au propriétaire ; les sets shared/public restent lisibles.
- L’historique reste lisible publiquement pour ne pas casser la page Historique.
- Les personas de base restent publiques en lecture.

Important
- Le live reste hébergé par l’onglet admin via PeerJS : l’admin doit garder son onglet ouvert pendant la partie.
- Les joueurs peuvent rejoindre sans compte ; la BDD n’est pas utilisée par eux pendant la partie live.
- L’admin doit idéalement avoir un compte connecté pour bénéficier de la synchro BDD, de la reprise admin et de l’historique distant.
