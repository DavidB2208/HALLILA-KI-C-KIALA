HALLILA : C KI KIA LA — version GitHub Pages + Supabase

Contenu
- index.html
- styles.css
- app.js
- supabase-config.js
- schema.sql
- bg-music.wav

Cette version est pensée pour être déployée via un repo GitHub / GitHub Pages.
Elle garde le live de partie via PeerJS, et relie les comptes, personas, sets, historique et snapshots de room à Supabase.

Ce qui est inclus
- écran de compte relié à Supabase quand la config est remplie
- partie live via lien partagé joueur
- choix simple depuis le lien : jouer directement ou passer par le compte
- l’admin peut aussi se joindre comme joueur en ouvrant le lien dans un autre onglet
- reprise admin par admin_token + live_state_json
- reconnexion joueur automatique si la connexion temps réel tombe
- avertissement clair si le lien partagé pointe vers localhost / une adresse locale

Déploiement GitHub Pages
1. Mets ces fichiers à la racine du repo.
2. Vérifie que GitHub Pages sert bien la branche choisie (souvent main / root).
3. Garde dans supabase-config.js l’URL + la clé publishable/anon du projet.
4. Dans Supabase, exécute schema.sql si ce n’est pas déjà fait.
5. Teste le site uniquement via l’URL publique GitHub Pages, pas via localhost, pour que les autres joueurs puissent rejoindre.

BDD
- Si ton schéma actuel contient déjà les tables Hallila + games.admin_token + games.live_state_json, tu n’as pas besoin de reset la BDD.
- Un reset n’est utile que si ton projet Supabase est devenu incohérent après plusieurs essais et migrations manuelles.

Important
- Le live reste hébergé par l’onglet admin via PeerJS : l’admin doit garder son onglet ouvert pendant la partie.
- Le lien d’invitation joueur fonctionne entre appareils seulement si le site est servi depuis une vraie URL publique.
