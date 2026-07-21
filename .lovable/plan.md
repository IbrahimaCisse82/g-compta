# Backoffice de gestion des abonnements

## Objectif
Créer un backoffice complet pour gérer les abonnements commerciaux (Starter / Pro / Cabinet), sans paiement en ligne intégré pour l'instant.

---

## Vue d'ensemble

Deux niveaux de backoffice :

1. **Mon abonnement** (vue entreprise) : dans les paramètres, l'utilisateur voit le plan actuel de son entreprise, les limites consommées et un bouton pour demander un changement de plan.
2. **Abonnements clients** (vue cabinet) : le cabinet liste et gère les abonnements de toutes ses entreprises (activer un essai, changer de plan, suspendre, renouveler).

Le paiement en ligne est reporté ; les actions se font par workflow manuel (activation directe en base + notification).

---

## Fichiers à créer / modifier

### Pages
- `src/pages/MonAbonnementPage.tsx` : plan actuel, limites utilisées, historique, demande d'upgrade/downgrade.
- `src/pages/AbonnementsClientsPage.tsx` : tableau de bord cabinet avec filtres, actions rapides, activation d'essai.
- `src/pages/AbonnementPage.tsx` : renommer en "Écritures récurrentes" dans le menu et la page pour lever l'ambiguïté avec les abonnements commerciaux.

### Navigation
- `src/components/AppShell.tsx` :
  - renommer l'entrée `abonnement` en `ecritures_recurrentes` avec le label "Écritures récurrentes" ;
  - ajouter `mon_abonnement` dans la section Paramètres ;
  - ajouter `abonnements_clients` dans la section Synthèse (visible uniquement en mode cabinet).
- `src/stores/app-store.tsx` : ajouter les nouveaux `PageId`.

### Logique métier
- `src/lib/subscription.ts` :
  - calcul de l'utilisation des limites (dossiers, utilisateurs, stockage Go) ;
  - helper pour déterminer si une entreprise dépasse son plan ;
  - mapping statut / couleur.

### Base de données
- Migration optionnelle : ajouter une politique RLS pour permettre au cabinet de créer un abonnement sur une entreprise qu'il gère, même si c'est sa première action.
- Vérifier que `abonnements` a bien un index sur `entreprise_id` pour les performances du cabinet.

---

## Détails techniques

### 1. Renommage de la page actuelle

La page actuelle `AbonnementPage.tsx` gère les `ecritures_abonnement` (écritures comptables récurrentes). Elle est mal nommée dans le menu. On la garde mais on la renomme en "Écritures récurrentes" pour libérer le terme "Abonnement" pour les plans commerciaux.

### 2. Page "Mon abonnement"

Affichage pour l'entreprise courante :
- Carte du plan actuel avec prix, périodicité, statut, dates.
- Grille des limites : dossiers, utilisateurs, stockage Go, avec barres de progression.
- Historique des changements de plan (lecture depuis `abonnements` + `plans_abonnement`).
- Bouton "Changer de plan" : ouvre une modale avec les 3 plans et un bouton "Demander la modification" (envoie une notification au cabinet sans paiement).

### 3. Page "Abonnements clients" (cabinet)

Tableau avec :
- Entreprise, plan, statut, date de début/fin, jours restants, limites, usage.
- Filtres : statut (essai, actif, suspendu, résilié), plan (Starter/Pro/Cabinet), recherche par nom d'entreprise.
- Actions rapides : activer essai 14 jours, changer de plan, suspendre, renouveler, marquer payé.
- Un bouton "Nouvel abonnement" pour attribuer un plan à une entreprise existante du cabinet.

### 4. Utilisation des limites

Calcul côté client (ou via edge function plus tard) :
- `dossiers` : `entreprises` liées au cabinet ou à l'utilisateur.
- `utilisateurs` : `cabinet_members` pour le cabinet, ou `profiles` associés à l'entreprise.
- `stockage_go` : agrégation des `taille_octets` de la table `documents` divisée par 1 Go.

### 5. Workflow sans paiement

Pour l'instant, les actions modifient directement la table `abonnements` via Supabase. Les futurs paiements seront branchés à la place de l'action manuelle.

### 6. Sécurité

- Lire `abonnements` via la RLS existante (`get_user_entreprise_ids`).
- Vérifier côté client que l'utilisateur est `admin` du cabinet avant d'afficher la page "Abonnements clients".
- Les actions d'admin cabinet utilisent la session authentifiée standard ; la RLS existante doit permettre l'INSERT/UPDATE sur les entreprises du cabinet. Si ce n'est pas le cas, on ajoute une policy.

---

## Sortie attendue

- Menu clair sans ambiguïté entre "Écritures récurrentes" et "Mon abonnement".
- Page "Mon abonnement" accessible depuis les paramètres.
- Page "Abonnements clients" accessible en mode cabinet.
- Aucune erreur TypeScript, navigation fonctionnelle, données affichées depuis `plans_abonnement` et `abonnements`.