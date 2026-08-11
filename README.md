# VivaStay — Dashboard Propriétaires

## Déploiement rapide (recommandé : Vercel)
1. Crée un repo Git avec ce dossier (`git init && git add . && git commit -m "init"`)
2. Sur vercel.com : "Add New Project" → importe le repo → Framework preset "Vite" → Deploy
3. C'est tout — les identifiants Supabase sont déjà dans `src/lib/supabaseClient.js` (clé publique, sans risque)

## En local
```
npm install
npm run dev
```

## Compte admin
- Email : vivastaymorocco@gmail.com
- Mot de passe : celui que tu as choisi (modifiable depuis "Mot de passe" dans l'appli une fois connecté)

## Ce qui a déjà été fait côté Supabase (projet: vivastay-owner-dashboard)
- Tables : profiles, properties, monthly_reports, reservations, charges, cleanings
- RLS activé : chaque propriétaire ne voit que ses biens ; l'admin voit tout
- Bucket de stockage `monthly-reports` pour les fichiers Excel originaux
- Edge Function `invite-owner` : envoie une invitation email quand l'admin ajoute un propriétaire

## Flux d'utilisation
1. **Admin → Biens & propriétaires** : crée les biens (nom EXACT tel qu'il apparaît en cellule A1 du fichier Excel) et invite les propriétaires par email
2. **Admin → Import mensuel** : choisis le mois, uploade le fichier Excel du bien, vérifie l'aperçu, valide
3. **Propriétaire** : se connecte, voit son historique mois par mois, télécharge le fichier original
