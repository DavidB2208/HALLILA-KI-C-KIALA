HALLILA : C KI KIA LA — version BDD

Contenu
- index.html
- styles.css
- app.js
- supabase-config.js
- schema.sql
- bg-music.wav

Ce qui a été ajouté
- liaison à une base Supabase/PostgreSQL
- tables complètes : users, personas, persona_sets, persona_set_items, games, game_players, game_rounds, idea_box_entries, player_rankings, round_results, round_reactions, history_entries, history_entry_players
- vues de stats : persona_stats, user_stats
- synchronisation locale -> base pour les comptes, personas, sets, parties, manches, réactions et historique
- fallback local si Supabase n’est pas configuré

Configuration
1. Crée un projet Supabase.
2. Exécute le contenu de schema.sql dans l’éditeur SQL.
3. Ouvre supabase-config.js et remplace les valeurs par ton URL et ta clé anon.
4. Déploie les fichiers sur GitHub Pages ou ouvre-les en local.

Important
- Cette version garde le fonctionnement local de l’app et pousse les données en base quand Supabase est configuré.
- Le système de compte suit ton schéma users/password_hash pour la démo. Pour une version production, il faudra migrer vers Supabase Auth côté authentification.
- La partie live reste hébergée par l’admin via PeerJS : l’admin doit garder sa page ouverte pendant la partie.


P1 appliqué dans ce package
- reprise de salle admin depuis la BDD grâce à games.admin_token + games.live_state_json
- logique online-first renforcée : état de sync en attente / erreur / prêt
- garde-fous de transitions de manche (lobby -> ranking -> results -> lobby)
- reconnexion automatique côté joueur quand la connexion PeerJS tombe
- prise en charge optionnelle de Supabase Auth pour création de compte / connexion / reset

À faire côté humain avant de tester la version online
1. Remplir supabase-config.js avec ton URL et ta clé anon.
2. Activer Email/Password dans Supabase Auth si tu veux utiliser la connexion en ligne.
3. Réexécuter schema.sql pour ajouter les nouvelles colonnes admin_token et live_state_json sur games.
4. Redéployer tout le dossier hallila_p1 ensemble.


P1.5 appliqué dans ce package
- chaque partie possède maintenant un lien joueur dédié via public_join_token
- les joueurs rejoignent la salle à partir du lien partagé, pas via l’identifiant technique de room
- depuis le lien, chacun choisit de continuer sans compte ou de créer/se connecter
- l’admin peut aussi se joindre comme joueur via le lien en ouvrant une place joueur dans un autre onglet
- pense à réexécuter schema.sql pour ajouter public_join_token et son index
