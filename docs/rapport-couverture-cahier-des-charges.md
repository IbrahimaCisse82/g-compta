# Rapport de couverture — Cahier des charges G-Compta v1.0

**Objet** : vérifier que l'application du dépôt couvre l'intégralité du cahier des charges
« Plateforme SaaS de comptabilité SYSCOHADA révisé » (v1.0 du 06/08/2026).
**Date** : 16/10/2026 — **Périmètre** : branche `fix-main-6123030dae18`, code `src/`, migrations
`supabase/migrations` (31) + `drizzle/migrations` (2), Edge Functions.
**Méthode** : lecture seule du code et des migrations. Aucune écriture en base, aucune donnée modifiée.

## Verdict

La couverture fonctionnelle est **quasi complète** : les 7 sections fonctionnelles (4.1 à 4.7),
les 3 Edge Functions, les 8 ensembles de tables et les livrables 1 à 8 sont présents.
**6 écarts** subsistent, dont **2 significatifs** :

| # | Écart | Exigence | Gravité |
|---|---|---|---|
| 1 | Suppression d'un compte mouvementé autorisée | 4.1.1 | **Moyenne** |
| 2 | Export des notes annexes : 52 notes au lieu de 54 annoncées | 4.2.4 / A5 | **Moyenne** |
| 3 | `strict: false` / `strictNullChecks: false` | 5.5 | Moyenne |
| 4 | Authentification Google absente de l'interface | 5.1 | Faible |
| 5 | Motif de refus non obligatoire | 4.4.2 | Faible |
| 6 | Dépréciations de la classe 59 non gérées | 4.3.3 | Faible |

Deux autres points sont **partiels** sans être des manques : la pagination côté serveur (5.3) et
la génération « périodique » des écritures récurrentes (4.1.3), qui est manuelle.

---

## 1. Socle comptable (4.1)

| Exigence | Statut | Preuve |
|---|---|---|
| 4.1.1 Plan comptable — classes 1 à 8, sens normal automatique, type automatique | ✅ | `src/pages/PlanComptablePage.tsx:6-10` (`CLS_LBL`, `SENS_AUTO`, `TYPE_AUTO`) |
| 4.1.1 Création / modification / désactivation | ✅ | `PlanComptablePage`, `app-store.tsx` (`addCompte`, `toggleCompte`) |
| 4.1.1 Interdiction de suppression si compte mouvementé | ❌ | `app-store.tsx:468` — `delete()` direct, aucun trigger ni contrainte sur `plan_comptable` |
| 4.1.1 Recherche par numéro / libellé, filtre par classe | ✅ | `PlanComptablePage.tsx:24-28` |
| 4.1.2 Exercices : création, états ouvert / clôturé, lecture seule visible | ✅ | `exercices.statut`, `isExerciceCloture()`, badge 🔒 en barre supérieure |
| 4.1.2 Clôture automatisée : résultat, affectation RAN 121/129, à-nouveaux sur N+1 | ✅ | `app-store.tsx:551-620` (exercice N+1 créé, à-nouveaux en journal `AN`) |
| 4.1.2 Réouverture par un admin, tracée | ✅ | `CloturePage.tsx` (`handleReopen`, journal `cloture_logs`) — réserve : contrôle du rôle admin délégué à la RLS, non vérifié |
| 4.1.3 Saisie par pièce multi-lignes, débit = crédit bloquant | ✅ | `SaisiePage.tsx:147-149,264`, `trg_ecritures_*` (migration Phase 1) |
| 4.1.3 Journaux normalisés AN, AC, VT, BQ, CA, OD, PA | ✅ | `src/lib/ecritures.ts:18,62` + test `ecritures.test.ts:64` |
| 4.1.3 Numérotation chronologique par journal | ✅ | table `ecriture_sequences`, `lib/ecritures.ts` (`ecriture_numero`) |
| 4.1.3 Écritures récurrentes (modèles + génération périodique) | ⚠️ | `AbonnementPage.tsx` + table `ecritures_abonnement` (périodicité, jour d'exécution, dernière exécution) — **déclenchement manuel**, aucune planification `pg_cron` |
| 4.1.3 Modification interdite sur exercice clôturé | ✅ | UI verrouillée + `trg_ecritures_periode` / `exercice_est_cloture()` |
| 4.1.4 Journal (filtres, CSV, FEC) | ✅ | `JournalPage.tsx`, `lib/fec-export.ts`, `lib/csv-export.ts` |
| 4.1.4 Grand livre, balance 4/6 colonnes, filtres | ✅ | `GrandLivrePage.tsx`, `BalancePage.tsx` |
| 4.1.4 Balance âgée clients/fournisseurs par tranches | ✅ | `BalanceAgeePage.tsx` |
| 4.1.4 Lettrage manuel et automatique | ✅ | `LettragePage.tsx:99-129` |
| 4.1.4 Piste d'audit immuable (triggers) | ✅ | tables `audit_log` / `journal_audit` + triggers — réserve : écriture `audit_log` bloquée par RLS et non par `REVOKE` (cf. rapport Phase 0, § 0.3) |

## 2. États financiers et liasse (4.2)

| Exigence | Statut | Preuve |
|---|---|---|
| 4.2.1 Alimentation par la balance + comparatif N-1 | ✅ | `app-store` (`balanceN1`), utilisé dans Bilan, Résultat, TFT |
| 4.2.2 Bilan brut / amortissements / net + N-1 | ✅ | `BilanPage.tsx`, `lib/pdf-export.ts` |
| 4.2.2 Compte de résultat avec SIG | ✅ | `ResultatPage.tsx`, `lib/accounting.ts` (XB…XI) |
| 4.2.2 TFT méthode indirecte + contrôle de la variation | ✅ | `lib/accounting.ts:335-359` (ZA…ZH, ligne « Contrôle ») |
| 4.2.2 54 onglets de notes (1 à 40, y compris 16B, 27B, 29C) | ✅ | `NotesAnnexesPage.tsx` — 54 onglets répartis en 6 groupes |
| 4.2.3 Moteur de validation des notes (comptes manquants / inattendus / écarts) | ✅ | `lib/notes-validation.ts` (`NOTES_SPEC`, `validateNotes`) + panneau de validation dans la page |
| 4.2.4 Export DSF + notes en un document, sommaire cliquable, pagination « Note X / 54 » | ⚠️ | `lib/dsf-annexes-export.ts` — sommaire cliquable ✅ mais **catalogue de 52 notes** : en-tête et pagination affichent « / 52 » |
| 4.2.4 FEC officiel 18 colonnes pipe | ✅ | `lib/fec-export.ts` (18 colonnes documentées et écrites) |
| 4.2.4 Exports CSV de tous les tableaux | ✅ | `lib/csv-export.ts` |
| 4.2.4 Impression A4 avec en-tête légal NINEA / RCCM | ✅ | `lib/pdf-export.ts:15-16`, `@media print` (`src/index.css:162`, `LiasseFiscalePage.tsx:137`) |

## 3. Modules de gestion (4.3)

| Exigence | Statut | Preuve |
|---|---|---|
| 4.3.1 Immobilisations : fiche, linéaire + dégressif + prorata | ✅ | `lib/amortissement.ts:11,42,62` + `amortissement.test.ts` |
| 4.3.1 Génération des dotations (68X / 28X) en un clic | ✅ | `ImmobilisationsPage.tsx:93-108` |
| 4.3.1 Cessions HAO (812 / 28XX / 485 / 822) + plus/moins-value | ✅ | `lib/amortissement.ts` (`comptesCession`) |
| 4.3.1 Alimentation des notes 3 et 3bis | ✅ | `NotesAnnexesPage` (notes 3A à 3E alimentées par `immobilisations`) |
| 4.3.2 Stocks : articles, familles, unités, CUMP | ✅ | `StocksPage.tsx`, `lib/stocks.ts` + `stocks.test.ts` |
| 4.3.2 Mouvements, état valorisé, écritures de variation de stock | ✅ | `lib/stocks.ts` (`lignesEcritureStock`, `variationValeur`) |
| 4.3.3 Provisions / dépréciations 19X, 29X, 39X, 49X | ✅ | `lib/provisions.ts:25-30` + `provisions.test.ts` |
| 4.3.3 Dépréciations de la classe 59 (titres de placement) | ❌ | absentes de `lib/provisions.ts` |
| 4.3.4 Facturation client : NINEA / RCCM, multi-lignes HT/TVA/TTC | ✅ | `FacturationPage.tsx:99,145,170` |
| 4.3.4 Comptabilisation en un clic au journal VT (411 / 70X / 4431) | ✅ | `FacturationPage.tsx:195-225` |
| 4.3.4 Aperçu et impression A4 avec mentions légales | ✅ | `FacturationPage.tsx:594` (`#invoice-print`) |
| 4.3.5 Fournisseurs : référentiel, factures d'achat multi-lignes | ✅ | `FournisseursPage.tsx` |
| 4.3.5 Comptabilisation au journal AC (60X / 4452 / 401) | ✅ | `FournisseursPage.tsx:247-276` (TVA 4451 si compte 2X) |
| 4.3.5 Tableau de bord des achats | ✅ | `FournisseursPage.tsx` (KPIs achats) |
| 4.3.6 Paie : salariés, paramètres configurables | ✅ | `PaiePage.tsx`, `paie_parametres`, `lib/paie.ts` |
| 4.3.6 IRPP 6 tranches, IPRES RG + cadres, CSS, CFCE, TRIMF, ancienneté | ✅ | `lib/paie.ts:67-75` (6 tranches), `:35-39` (taux + plafonds), `:44-50` (ancienneté) |
| 4.3.6 Bulletins imprimables A4 + écritures journal PA (661/648/664 vs 421/431/432/447) | ✅ | `PaiePage.tsx` + `lib/paie.ts` (mapping comptes d'écriture) |
| 4.3.7 TVA : comptes et taux paramétrables, TVA nette, crédit reportable antérieur | ✅ | `tva_parametrage`, `TvaPage.tsx:52-61` (`credit_precedent`) |
| 4.3.7 Montant à payer ou crédit à reporter + écriture de déclaration | ✅ | `TvaPage.tsx:82-99` (4441 en solde créditeur / 4449 en crédit à reporter) |
| 4.3.8 Échéancier : calendrier annuel généré (TVA, IRPP, IPRES, CSS, acomptes IS, DSF) | ✅ | `EcheancierPage.tsx:26-31` (modèles), `:170-225` (génération annuelle) |
| 4.3.8 Suivi à déclarer / déclaré / payé + alertes J-7 | ✅ | `EcheancierPage.tsx:110-111,159`, cron `alertes-echeances-quotidiennes` → `fn_generer_alertes_echeances()` |
| 4.3.9 Analytique : axes, sections, ventilation | ✅ | `AnalytiquePage.tsx`, tables `axes_analytiques`, `ventilations_analytiques` |
| 4.3.9 Budgets par compte et période, écarts budget / réalisé | ✅ | `BudgetPage.tsx`, table `budgets` |
| 4.3.10 Mobile Money : Wave, Orange Money, Free Money, Wizall | ✅ | `MobileMoneyPage.tsx:36-39` |
| 4.3.10 Import CSV des relevés, rapprochement, soldes par opérateur | ✅ | `MobileMoneyPage.tsx` (onglets opérations / moyens / import), tables `moyens_paiement`, `transactions_mm` |
| 4.3.11 Rapprochement bancaire : import, pointage manuel et automatique | ✅ | `RapprochementPage.tsx:6-41` |
| 4.3.11 État de rapprochement imprimable | ⚠️ | aucune édition dédiée dans la page ; impression via le bouton global 🖨 (`window.print`) |

## 4. Collaboration (4.4)

| Exigence | Statut | Preuve |
|---|---|---|
| 4.4.1 GED : bucket privé, cloisonné, métadonnées complètes | ✅ | `DocumentsPage.tsx:39-75` (bucket `ged`, catégorie, `ref_type`, mime, taille), RLS sur `documents` |
| 4.4.1 Téléchargement par URL signée à durée limitée | ✅ | `DocumentsPage.tsx:94` (`createSignedUrl(..., 60)`) |
| 4.4.2 Cycle brouillon → soumis → validé / refusé | ✅ | `ValidationPage.tsx:24-28,67-74` |
| 4.4.2 Motif de refus obligatoire | ⚠️ | `ValidationPage.tsx:73` — `motif \|\| 'Non spécifié'` : le refus sans motif est accepté |
| 4.4.2 Écran de traitement dédié pour le valideur | ✅ | `ValidationPage.tsx` (onglets par statut) |
| 4.4.3 Accès portail par email + permissions granulaires | ✅ | `PortailPage.tsx:8-15` (`peut_voir_bilan`, `peut_voir_resultat`, `peut_voir_documents`, `peut_voir_factures`, `peut_deposer_documents`) |
| 4.4.3 Portail public sans JWT validé par Edge Function | ✅ | `supabase/functions/portail-public/index.ts` |
| 4.4.3 Consultation bilan / résultat / documents | ✅ | `PortailPublicPage.tsx` (via la fonction) |
| 4.4.3 Dépôt par URL signée, limite 20 Mo, notification du cabinet | ✅ | `portail-public/index.ts:50-73` (limite `20 * 1024 * 1024`) |
| 4.4.4 Notifications typées + Edge Function d'envoi | ⚠️ | `notifications` (colonne `type TEXT` **sans contrainte**), `send-notification/index.ts`, déclencheurs écriture soumise / validée / refusée, échéance J-7, dépôt, changement de plan |

## 5. e-Facturation DGID (4.5)

| Exigence | Statut | Preuve |
|---|---|---|
| Configuration par entreprise | ✅ | table `dgid_config`, `FacturesDgidPage.tsx` |
| Edge Function d'émission avec statut, UUID, hash, QR code | ✅ | `emit-facture-dgid/index.ts:47-94` |
| Historique complet par facture | ✅ | tables `dgid_transmissions` + `factures.statut_dgid`, `FacturesDgidPage.tsx:58` |

## 6. Mode Cabinet (4.6) et backoffice (4.7)

| Exigence | Statut | Preuve |
|---|---|---|
| « Mes Clients » + bascule instantanée | ✅ | `AppShell.tsx` (`ClientsPage`, `switchEntreprise`) |
| Gestion des membres et de leurs rôles | ✅ | `CabinetPage.tsx`, tables `cabinets`, `cabinet_members`, `invitations` |
| KPI collaborateurs (volume, vitesse, taux de validation) | ✅ | `KpiCollabPage.tsx:54-93` (`ecritures_saisies`, `delai_moyen_h`, `taux_validation`) |
| Abonnements clients : plan, statut, dates, limites | ✅ | `AbonnementsClientsPage.tsx` |
| Actions : essai 14 jours, changement de plan, suspension, renouvellement, marquage payé | ✅ | `AbonnementsClientsPage.tsx:82-135` (`essai_fin` +14 j, `updateStatus`, prolongation) |
| Plans Starter / Pro / Cabinet en base (prix, périodicité, limites) | ✅ | migration `20260714214802` — codes `starter`, `pro`, `cabinet` + `limites` |
| Vue « Mon abonnement » : dates, progression des limites, historique, demande notifiée | ✅ | `MonAbonnementPage.tsx:116-302` |
| Activation manuelle dans cette phase (pas de paiement en ligne) | ✅ | `MonAbonnementPage.tsx:279` |

## 7. Exigences non fonctionnelles

| Exigence | Statut | Preuve / réserve |
|---|---|---|
| 5.1 Email + mot de passe, réinitialisation par email | ✅ | `AuthPage.tsx:15,49` |
| 5.1 Authentification Google | ❌ | aucun `signInWithOAuth` dans `src/` |
| 5.1 RLS sur toutes les tables du schéma public | ✅ | 51/51 tables (rapport Phase 0, § 0.3) — privilèges `anon` encore larges |
| 5.1 Rôles en table dédiée + `SECURITY DEFINER` | ⚠️ | `user_roles` + `can_write_entreprise` / `can_admin_entreprise` ; `get_user_entreprise_ids()` **n'utilise pas** `user_roles` → le rôle ne détermine pas le périmètre de lecture (Phase 0, § 0.4) |
| 5.1 Stockage privé, aucun secret côté client | ✅ | bucket `ged` + URL signée ; aucun `service_role` dans `src/` |
| 5.2 Équilibre débit/crédit à l'enregistrement | ✅ | saisie bloquante + triggers |
| 5.2 Triggers d'audit sur les tables sensibles | ✅ | `audit_log`, `journal_audit` |
| 5.2 Verrouillage physique des exercices clôturés | ⚠️ | `ecritures` protégées ; la table héritée `journal` **ne l'est pas** (Phase 0, § 0.6/0.7) |
| 5.3 Index sur `entreprise_id`, `exercice_id`, `compte`, `date` | ✅ | `CREATE INDEX` dans les migrations initiales |
| 5.3 Pagination et filtrage côté serveur | ⚠️ | 57 `select('*')` pour 8 `.limit(` : pas de pagination sur les listes volumineuses |
| 5.3 Balance de 5 000 comptes < 2 s | non mesuré | nécessite la base hébergée avec volumétrie réelle |
| 5.4 Interface en français, double thème (sombre par défaut) | ✅ | `use-theme.ts` (`'dark'` par défaut), bascule Alt+T |
| 5.4 Responsive mobile → grand écran | ✅ | Tailwind responsive + barre latérale repliable |
| 5.4 Raccourcis Alt+D/S/J/B/G/I/R/P/E/T/M/? | ✅ | `use-keyboard-shortcuts` + `AppShell.tsx` (modale d'aide) |
| 5.5 Typage strict TypeScript | ❌ | `tsconfig.app.json:25` `"strict": false` ; `tsconfig.json:13` `"strictNullChecks": false` |
| 5.5 Tests Vitest TVA / paie / amortissements | ✅ | 9 fichiers de tests dont `tva.test.ts`, `paie.test.ts`, `amortissement.test.ts` |
| 5.5 Logique de calcul en bibliothèques pures | ✅ | `src/lib/*.ts` testables indépendamment de l'interface |

## 8. Architecture, Edge Functions et livrables

| Exigence | Statut |
|---|---|
| 6.1 Pile React 18 / Vite 5 / TS 5 / Tailwind 3 / shadcn-ui + PostgreSQL + Edge Functions + Vitest | ✅ |
| 6.2 Tous les ensembles de tables annoncés (`entreprises`, `exercices`, `journal`, `immobilisations`, `plans_abonnement`…) | ✅ 51 tables en base, dont les 40+ annoncées |
| 6.3 `portail-public`, `send-notification`, `emit-facture-dgid` | ✅ les 3 fonctions sont présentes |
| 6.4 Multi-tenant par `entreprise_id` + RLS | ✅ |
| 7.1 Application web accessible par URL publique | ⚠️ déployée par GROW HUB hors de cet environnement (aucune URL publique dans ce sandbox) |
| 7.2 Migrations versionnées + RLS | ✅ 33 migrations |
| 7.4 Jeu de démonstration « PME 1 » | ✅ `lib/demo-data.ts` |
| 7.5 Suite de tests unitaires | ✅ |
| 7.7 Pages légales CGU, confidentialité, protection des données | ✅ `CguPage`, `ConfidentialitePage`, `ProtectionDonneesPage` |
| 7.8 Landing publique + grille tarifaire | ✅ `components/Landing.tsx`, `TarifsPage` |

## 9. Critères d'acceptation (section 9 du cahier des charges)

| # | Critère | Statut | Commentaire |
|---|---|---|---|
| A1 | Aucune écriture déséquilibrée enregistrable | ✅ | contrôle de saisie + triggers serveur |
| A2 | Bilan équilibré (actif = passif) | ✅ | `ControleBalance.tsx` compare balance stockée et balance dérivée (`mv_balance`) |
| A3 | Résultat du compte de résultat = résultat au bilan | ✅ | même calcul `XI` (`lib/accounting.ts`) pour les deux états |
| A4 | Variation de trésorerie du TFT cohérente avec le bilan | ✅ | ligne de contrôle `ZH` du TFT |
| A5 | Les 54 notes annexes présentes et alimentées | ⚠️ | 54 onglets ✅ / export consolidé 52 notes ❌ |
| A6 | FEC accepté au format 18 colonnes | ✅ | `lib/fec-export.ts` |
| A7 | Aucune donnée d'une entreprise non accessible | ⚠️ | isolation vérifiée par simulation SQL en Phase 0 ; reste à recontrôler avec des jetons réels |
| A8 | Exercice clôturé inaccessible en écriture | ⚠️ | vrai pour `ecritures`, **pas** pour la table héritée `journal` |
| A9 | Rôle lecteur sans droit de modification | ⚠️ | écriture refusée par RLS en Phase 0 ; le rôle ne pilote pas la lecture |
| A10 | États officiels imprimables A4 avec NINEA / RCCM | ✅ | `pdf-export.ts` + `@media print` |
| A11 | Calculs paie / TVA / amortissement conformes | ✅ | 3 suites de tests dédiées (+6 autres) |
| A12 | Limites d'abonnement affichées et calculées | ✅ | `MonAbonnementPage` (barres de progression `computeUsage`) |

## 10. Hors périmètre confirmé (section 2.2 / sprint 11-12)

Payement en ligne des abonnements (Stripe/Wave marchand) : **absent, conforme** — l'interface annonce
« Le paiement en ligne n'est pas encore activé ». Copilote IA, SMT, IFRS, consolidation, application
mobile native : **absent, conforme**. Rapports personnalisables (sprint 12) : non implémentés, statut
« à planifier ».

*Point d'attention documentaire* : la fiche du plan **Cabinet** (`plans_abonnement`, migration
`20260714214802`) annonce « Copilote IA (imputation, anomalies) », fonctionnalité explicitement
écartée par le cahier des charges. Texte commercial à corriger.

## 11. Ce qui reste non vérifiable depuis cet environnement

- Configuration du projet Supabase hébergé (fournisseur Google, désactivation de l'inscription
  anonyme et de la confirmation automatique d'email) : `supabase/config.toml` ne contient que
  `project_id`.
- Comportement de bout en bout de la RLS avec de **vrais jetons** `lecteur` / `comptable` / `réviseur` :
  aucun compte de test n'existe (cf. rapport Phase 0, § 0.4).
- Tenue de performance de 5 000 comptes (< 2 s) : nécessite la base hébergée avec volumétrie réelle.

## 12. Écarts à traiter (proposition d'ordre)

1. **Compte mouvementé** — bloquer la suppression dans `plan_comptable` (trigger ou garde serveur) — 4.1.1.
2. **Export des notes** — porter le catalogue à 54 notes pour aligner sommaire, pagination et onglets — 4.2.4 / A5.
3. **Typage strict** — activer `strict` / `strictNullChecks` puis corriger les erreurs — 5.5.
4. **Motif de refus obligatoire** — refuser la validation du formulaire sans motif — 4.4.2.
5. **Dépréciations classe 59** — ajouter la nature manquante dans `lib/provisions.ts` — 4.3.3.
6. **Google Auth** — ajouter le bouton et activer le fournisseur côté Supabase — 5.1.
7. (Suites) pagination serveur, exécution planifiée des écritures récurrentes, contrainte sur
   `notifications.type`, protection de la table héritée `journal`, retrait de la mention « Copilote IA ».

---

*Rapport établi par lecture du code et des migrations, sans modification de l'application ni des données.*
