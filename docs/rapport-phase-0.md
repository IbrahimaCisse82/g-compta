# Rapport Phase 0 — Constat factuel (v2, 15/10/2026)

Éditeur : GROW HUB SARL · Périmètre : prompt v2 du 02/10/2026, **Phase 0 uniquement**.
Cette version **remplace** le rapport du 02/10/2026 (conservé dans l'historique git) et le revérifie point par point : la Phase 1 a modifié la base et le code depuis, donc plusieurs constats de la v1 ne sont plus reproductibles aujourd'hui (signalés ci-dessous).

**Aucune modification fonctionnelle, aucune donnée modifiée.** Aucune écriture sur la base hébergée.

## Méthode et provenance des preuves

Trois sources, distinguées dans tout le rapport :

| Source | Nature | Portée |
|---|---|---|
| **B** — Base hébergée (projet Supabase `uhbbvcwbfnapofkansag`), via l'API REST avec la clé publique | Lecture seule, rôle `anon` | Volumétrie et lecture réelles des dossiers existants |
| **C** — Code et migrations du dépôt (branche `fix-main-6123030dae18`) | Lecture | Règles de gestion, écritures client, exports |
| **L** — Base locale de vérification, **reconstruite depuis `supabase/migrations` (31 migrations) + `drizzle/migrations` (2 migrations)**, avec les privilèges par défaut Supabase reproduits, puis chargée avec le jeu de démonstration du dépôt | Exécution SQL | Schéma, RLS, privilèges, tentatives de contournement, requêtes de divergence |

- Les 31 + 2 migrations s'appliquent : **une seule erreur**, sur `CREATE EXTENSION pg_cron` (extension absente d'un PostgreSQL nu ; sans effet sur les objets applicatifs).
- La base locale restitue **exactement** la volumétrie du dossier de démonstration hébergé : `journal` = 10 lignes (hébergé : `content-range 0-0/10`), `balance` = 21 lignes (hébergé : `0-0/21`).
- Deux vérifications ont été faites **directement sur la base hébergée** (rôle `anon`, lecture seule) : `journal` et `balance` sont lisibles (10 / 21 lignes), et `INSERT` sur `journal` est refusé (`401 / 42501 permission denied for table journal`).
- **Non vérifiable depuis cet environnement** : les tentatives 0.4 (a) à (c) avec **jetons réels** d'utilisateurs `lecteur` / `comptable` / `reviseur` : aucun compte de test n'existe et je n'en crée pas. Elles sont ici reproduites **par simulation SQL fidèle** (`SET ROLE authenticated` + `request.jwt.claim.sub`), ce qui fait foi sur les privilèges et les politiques, mais ne prouve pas le comportement de PostgREST de bout en bout.

---

## (a) Constats vérifiés, avec preuve

### 0.1 — Divergence journal ↔ table `balance` — **Confirmé** (source L)

Requête par compte (`FULL OUTER JOIN` sur entreprise/exercice/compte, somme du journal vs colonnes `md`/`mc` de `balance`) :

- **21 comptes comparés, 20 en écart** (soit 95 % des comptes).
- Exemples mesurés : `401100` journal 2 950 000 (crédit) vs balance 61 549 478 / 61 984 538 · `521100` 5 950 000 vs 130 532 806 / 130 667 008 · `702100` 5 000 000 vs 101 161 373 · `213200` 210 000 vs 0 · `129000` 0 vs 1 197 165.
- Cause structurelle : le `journal` ne contient que **10 lignes** alors que la table `balance` porte l'historique complet (montants agrégés d'un système antérieur). Ce n'est pas un défaut de calcul mais un **écart de reprise de données** : les deux jeux ne décrivent pas le même périmètre.
- Nombre de dossiers touchés : **1** (le dossier de démonstration `PME 1` est le seul dossier présent).

### 0.2 — Types monétaires — **Confirmé** (source L)

- `real` / `double precision` / `money` / `float` : **0 colonne**. Les montants ne sont jamais en flottant — la règle « pas de float » de R4 est respectée.
- **81 colonnes `numeric`**, dont **55 sans précision** (ex. `balance.md/mc/sd/sc/sfd/sfc`, `journal.debit/credit`, `bulletins_paie.brut`, `amortissements.vnc`, `provisions.montant`…) → **R4 (`NUMERIC(18,2)`) non respectée** sur 55 colonnes.
- 17 colonnes sont en `(18,2)` ; 9 en `(18,4)` ou `(5,2)` — ce sont des **quantités et taux** (`articles.quantite_stock`, `mouvements_stock.cump_apres`, `factures_achat_lignes.taux_tva`), pour lesquels 4 décimales sont légitimes ; elles ne relèvent pas de R4.
- Rappel : des contraintes `CHECK (… = round(…,2))` ont été posées en Phase 1 sur `journal`, `factures`, `bulletins_paie` (`drizzle/migrations/0000_phase1_verrous_balance_sod.sql`), ce qui **borne** les valeurs à 2 décimales sans changer le type : mesure et exigence restent distinctes.

### 0.3 — Inventaire RLS — **Confirmé**, avec amélioration nette depuis la v1 (source L)

- **51 tables** dans `public` (48 au 02/10 : les tables de Phase 1 s'y ajoutent).
- **RLS activée sur 51/51** ; **0 table sans RLS** ; **0 table avec RLS mais sans aucune politique**.
- Politiques : SELECT 64 politiques (51 tables couvertes), INSERT 37, UPDATE 37, DELETE 33, ALL 7.
- **Privilèges par commande (rôle `authenticated`)** — c'est ici que la v1 est périmée :

| Table | Privilèges `authenticated` | Effet |
|---|---|---|
| `balance` | `SELECT` seul | ✅ CA-1.3 : plus aucune écriture API possible (v1 : INSERT/UPDATE/DELETE) |
| `ecritures`, `ecriture_lignes` | `SELECT` seul | ✅ Écriture uniquement par les fonctions serveur |
| `journal` | `INSERT, UPDATE, SELECT` (**DELETE retiré**) | ⚠️ **subsiste** : écriture directe possible par un `comptable`/`admin` (politiques `journal_ins`, `journal_upd` actives) |
| `audit_log` | `INSERT, UPDATE, DELETE, SELECT` | ⚠️ l'ajout seul (1.8) n'est pas obtenu par `REVOKE` — seule l'absence de politique d'écriture bloque |
| `periodes`, `plans_abonnement` | écriture accordée, **aucune** politique d'écriture | privilège inutile (deny par RLS) : incohérence à nettoyer |
| `comptes_systeme` | `INSERT, UPDATE, SELECT` | politiques `cs_ins`/`cs_upd` réservées à `can_admin_entreprise` → conforme à 2.1 |

- Rôle `anon` : SELECT sur 51 tables et privilèges d'écriture sur 44–46 tables (privilèges par défaut du projet Supabase). **Aucune politique d'écriture `anon`** ⇒ RLS bloque, ce qui est confirmé sur la base hébergée : `INSERT` anonyme sur `journal` → `401 permission denied`. La surface reste trop large en privilèges (R3 veut des `GRANT` explicites) même si elle n'est pas exploitable en l'état.

### 0.4 — Contournement par l'API — **Partiellement vérifiable** (source L)

Jeu de test : `lecteur` rattaché au dossier PME 1 par `user_roles(entreprise_id)` ; utilisateur « étranger » sans aucun rattachement. Résultats mesurés :

| Tentative | Résultat mesuré |
|---|---|
| (a) `lecteur` — `SELECT` journal / balance | **autorisé** sur les tables (privilèges) — voir la réserve importante ci-dessous |
| (a) `lecteur` — `INSERT`/`UPDATE`/`DELETE` sur `journal` | **refusé** : `new row violates row-level security policy for table "journal"` (politique `can_write_entreprise`), `DELETE` refusé par absence de privilège |
| (a bis) `lecteur` — `INSERT` sur `clients` | **refusé** (RLS) |
| (a ter) `lecteur` — `INSERT` sur `comptes_systeme` | **refusé** (RLS : réservé admin) |
| (b) utilisateur sans rattachement — `SELECT` journal / balance / plan | **0 ligne** (isolation correcte) |
| (b) utilisateur sans rattachement — `INSERT` journal / `clients` | **refusé** (RLS) |
| (c) `anon` — `SELECT` journal / balance | **10 / 21 lignes** (politiques « démo »), identique sur la base hébergée |

⚠️ **Réserve (nouveau constat, non présent dans la v1)** : le rattachement par `user_roles(entreprise_id)` **ne donne aucun accès en lecture**. `get_user_entreprise_ids()` (utilisée par **toutes** les politiques `SELECT`) n'unionne que `entreprises.user_id` et `cabinet_members` : elle ignore `user_roles`. Mesuré : ce `lecteur` voit **0 ligne** de `journal`/`balance`. Le modèle de rôles de 1.1 est donc **à moitié câblé** : il décide des droits d'écriture (`can_write_entreprise` → `get_entreprise_role` lit bien `user_roles`) mais pas du périmètre de lecture.

**Reste à exécuter avec des jetons réels** (non fait ici) : (a) un `lecteur` réel, (b) un utilisateur sans appartenance, (c) un utilisateur d'une autre entreprise, en `INSERT`/`UPDATE`/`DELETE` et en lecture. C'est la seule partie de 0.4 qui manque.

### 0.5 — Pièces déséquilibrées — **Confirmé** (source L)

5 pièces sur 5 (toutes les pièces du dossier sont déséquilibrées) :

| Journal | Pièce | Date | Débit | Crédit | Écart |
|---|---|---|---|---|---|
| BQ | BQ-015 | 30/06/2022 | 5 950 000 | 0 | +5 950 000 |
| VT | VT-001 | 15/03/2022 | 5 950 000 | 5 000 000 | +950 000 |
| AC | AC-001 | 02/04/2022 | 2 500 000 | 2 950 000 | −450 000 |
| AN | AN-002 | 01/01/2022 | 0 | 100 000 | −100 000 |
| AN | AN-001 | 01/01/2022 | 210 000 | 140 000 | +70 000 |

Équilibre global : débit **14 680 000** / crédit **8 260 000**, écart **6 420 000**. Aucune pièce n'est équilibrée : la mise en quarantaine (1.7) concernera **100 % du journal existant**, sans rééquilibrage automatique.

### 0.6 — Écritures hors exercice ou sur exercice clôturé — **Confirmé (clôture) / Infirmé (bornes)** (source L)

- Lignes hors bornes de dates de l'exercice : **0** (constat de la v1 confirmé, « Infirmé » maintenu).
- **Nouveau** : les **10 lignes** du journal sont rattachées à un exercice dont le statut est **`cloture`** (dossier de démonstration, exercice 2022). La v1 ne mesurait que les dates : la dimension « exercice clôturé » n'avait pas été testée.
- Aucune ligne dans `periodes` (0 période définie) : le verrouillage par période (1.5) existe en structure mais n'est pas alimenté.
- Pour mémoire, hors périmètre Phase 0 : le déclencheur `trg_ecritures_periode` protège les `ecritures` (moteur validé), **pas** la table héritée `journal`.

### 0.7 — Points d'écriture de la `balance` — **Partiellement infirmé** (source C)

- Sur `balance` : **0 écriture client**. Les seules occurrences sont 3 lectures de repli (`stores/app-store.tsx` l.133, 169, 183) ; la source de vérité est la vue matérialisée `mv_balance` via `fn_balance` / `fn_balance_ecarts` (`lib/ecritures.ts` l.126, 143). Les 6 écritures signalées au 02/10 ont bien été supprimées → **constat v1 périmé**.
- **Mais le même défaut subsiste sur `journal`** : `src/pages/ValidationPage.tsx` l.76-80 exécute un `UPDATE` client de `journal` (`.update(updates).eq('piece', piece)`) qui pose `statut_validation`, `valide_par`, `valide_le`. C'est une **mutation comptable hors moteur serveur** (violation de R5) et le seul point d'écriture client restant sur les écritures.

### 0.8 — Signaux de risque dans le code — **Partiel** (source C, comptages exacts)

| Signal | Mesure | Statut |
|---|---|---|
| `?? 'admin'` | **0 occurrence** (le défaut permissif a bien été retiré ; `use-user-role.ts` retombe sur `'lecteur'`) | ✅ Conforme |
| `catch {}` strictement vide | **0 occurrence** | ✅ Conforme |
| `catch` avec repli silencieux + commentaire | **6 occurrences** (ex. `app-store.tsx` : `catch { /* repli ci-dessous */ }`, `catch { /* keep current */ }`) | ⚠️ Tolérable (repli documenté) mais ne remonte ni ne journalise — R7 à durcir |
| `dangerouslySetInnerHTML` | **1 occurrence** : `components/ui/chart.tsx` l.70, contenu de style statique (shadcn) | ✅ Conforme |
| `select('*')` | **57 occurrences** (dont 18 dans `app-store.tsx`, 5 dans `use-cabinet.ts`), contre 8 `.limit(` | ⚠️ R5/4.5 : pas de pagination |
| Secret côté client | **0 occurrence** de `service_role` dans `src` (seul le `.env` public : URL + clé publiable) | ✅ Conforme |
| Erreur silencieuse dans le portail | `update({derniere_connexion}).then(() => {})` (l.51) ignore l'erreur | ⚠️ R7 |

### 0.9 — Portail public et Storage — **Confirmé** (source C)

Fonction `supabase/functions/portail-public/index.ts` (sans JWT, clé **service role**) :

- Accès validé **par la seule connaissance d'un e-mail** présent dans `portail_acces` (`actif`) + `entreprise_id` → aucune preuve de possession de la boîte mail. **Aucun lien à usage unique, aucun OTP.**
- **Aucun rate limiting** (ni par IP ni par e-mail) ; seule limite : taille ≤ 20 Mo, `filename` ≤ 200 caractères, nom assaini (`[^a-zA-Z0-9._-] → _`).
- **Aucune liste blanche MIME ni d'extension** (le `mime_type` annoncé par le client est stocké tel quel).
- **`Access-Control-Allow-Origin: *`** sur une fonction dotée des droits `service_role` : n'importe quelle origine peut l'appeler ; combiné à la validation par e-mail seul, un tiers connaissant ces deux valeurs peut lire le bilan, la balance (`balance`, `select('*')`) et les documents (URLs signées).
- Points positifs : bucket `ged` privé, URL signée de **300 s (≤ 5 min)**, chemin de dépôt contraint au préfixe `${entreprise_id}/portail/`, listes limitées à 200 lignes, erreurs renvoyées explicitement.

### 0.10 — Numérotation et FEC — **Partiel** (sources C + L)

- **Numéro d'écriture persistant** : `ecritures.numero_sequence` + `numero`, contrainte d'unicité, alimentés par `fn_creer_ecriture` depuis la table compteur `ecriture_sequences (entreprise_id, exercice_id, journal_code, dernier_numero)` via `INSERT … ON CONFLICT DO UPDATE … RETURNING` — **aucun `nextval`** dans le dépôt (recherche : 0 occurrence). ✅ Conforme à 1.3 sur la méthode.
- ⚠️ **Écart** : le numéro est alloué **à la création** de l'écriture (`fn_creer_ecriture`), pas à la validation, alors que 1.2 exige `numero_sequence` NULL tant que l'écriture n'est pas validée : un brouillon supprimé ou refusé laisse un **trou**.
- **Export FEC** (`lib/fec-export.ts`) : `EcritureNum` = `ecriture_numero` (persisté) **sinon** compteur local `journal+pièce` (l.95) ; `ValidDate` = `valide_le` **sinon** `created_at` (l.116) ; `CompAuxNum` / `CompAuxLib` présents ; libellés de journaux **codés en dur** (`JOURNAL_LIBELLES`, pas de table `journaux`) ; pas de tri explicite des lignes ⇒ l'identité « à l'octet près » de CA-3.1 n'est pas garantie.
- Conséquence des constats 0.5/0.7 : les **10 lignes actuelles sont orphelines** (`ecriture_id IS NULL`, `statut_validation = 'brouillon'`, **0 écriture** en base) ⇒ dans l'état actuel du dossier, `EcritureNum` est **recalculé** pour 100 % des lignes et `ValidDate` retombe sur `created_at`.
- `ecriture_sequences` est vide : aucune numérotation encore attribuée.

---

## (b) Changements réalisés

**Aucun changement fonctionnel, aucune migration, aucune donnée modifiée** (exigence Phase 0). Seul ajout : ce rapport.

Un environnement de vérification **hors application** a été monté puis retiré (conteneur PostgreSQL jetable) : il ne fait pas partie du dépôt et n'affecte ni la base hébergée ni l'application.

## (c) Critères d'acceptation de la Phase 0

| Critère | Statut | Preuve / test |
|---|---|---|
| 0.1 Divergence journal ↔ balance chiffrée | **Fait et testé** | Requête `FULL OUTER JOIN` : 21 comptes comparés, 20 en écart (source L) ; volumétrie identique à la base hébergée (10 / 21 lignes) |
| 0.2 Inventaire des types monétaires | **Fait et testé** | `information_schema.columns` : 0 flottant, 55 `numeric` sans précision (source L) |
| 0.3 Matrice RLS table × commande | **Fait et testé** | 51 tables, RLS 51/51, 0 table sans politique, matrice par commande et par rôle mesurée (source L) |
| 0.4 Tentatives de contournement | **Partiel** | 7 tentatives sur 9 **reproduites en SQL fidèle** (rôles/RLS/privilèges) ; **les tentatives par jetons réels ne sont pas exécutées** (aucun compte de test) — critère **non clos** |
| 0.5 Pièces déséquilibrées | **Fait et testé** | 5/5 pièces, détail et écart global 6 420 000 (source L) |
| 0.6 Hors exercice / clôturé | **Fait et testé** | 0 ligne hors bornes ; 10/10 lignes sur exercice `cloture` (source L) |
| 0.7 Points d'écriture de la balance | **Fait et testé** | `balance` : 0 écriture client (3 lectures) ; `journal` : 1 `UPDATE` client (`ValidationPage.tsx` l.76-80) |
| 0.8 Signaux de risque | **Fait et testé** | Comptages exacts du tableau 0.8 (source C) |
| 0.9 Portail public / Storage | **Fait (revue de code)** | Faiblesses listées ; test dynamique non exécuté (aucun accès de test) |
| 0.10 Numérotation et FEC | **Fait et testé** | `ecriture_sequences` sans `nextval` ; FEC : repli `created_at`/compteur local documenté ; 10/10 lignes orphelines |
| Classement nominatif **F1–F10 / S1–S17 / R1–R12** | **Non fait — bloqué** | La grille détaillée du **rapport d'audit v1.0 (6 août 2026)** n'est pas dans le dépôt : impossible de classer des constats nommés que je ne peux pas lire. Fournir le rapport (ou la liste F1…R12) pour clore ce critère |
| Aucune donnée modifiée | **Passé** | Aucune écriture : base hébergée sollicitée uniquement en `SELECT` avec la clé publique |

**Verdict Phase 0 : non clos.** Les constats 0.1 à 0.10 sont établis et prouvés, mais (i) le classement F/S/R reste impossible sans le rapport d'audit, et (ii) les tests 0.4 par jetons réels n'ont pas été exécutés. Conformément à R8, la Phase 1 ne doit pas être déclenchée comme « validée » sur cette base.

## (d) Écarts, risques résiduels, points à trancher

1. **Accès à la base** : je n'ai que la clé publique côté client. Pour exécuter 0.4 (jetons réels), 0.3 sur la base hébergée (`has_table_privilege`) et les requêtes de la Phase 1, il faut soit des **comptes de test** (`lecteur`, `comptable`, `reviseur`, utilisateur d'un autre tenant), soit un accès SQL (éditeur SQL Supabase / rôle `service_role`). Sans cela, plusieurs critères de la Phase 1 resteront « non testé ».
2. **Rapport d'audit v1.0 absent du dépôt** → critère de classement F/S/R non satisfait, et l'annexe A (⚠ À VALIDER) ne pourra pas être instruite.
3. **`journal` reste modifiable par l'API** (`INSERT`, `UPDATE` pour `authenticated`) et le client s'en sert (`ValidationPage`) : R5 non satisfaite pour la table héritée, alors que la v1 la déclarait corrigée pour `balance`.
4. **Modèle de rôles à moitié câblé** : un rattachement par `user_roles.entreprise_id` donne des droits d'écriture mais **aucune lecture** (`get_user_entreprise_ids` l'ignore). Risque de blocage utilisateur en Phase 1 si `cabinet_members` est retiré sans corriger la lecture.
5. **Numérotation allouée à la création** ⇒ trous de numérotation (CA-1.5 en danger) et FEC non persisté pour les lignes sans écriture.
6. **`audit_log`** : `REVOKE UPDATE, DELETE` (1.8) non appliqué ; la protection repose uniquement sur l'absence de politique.
7. **Divergence journal/balance** : 20 comptes sur 21 en écart, 5 pièces sur 5 déséquilibrées, 10 lignes orphelines ⇒ 1.7 (reprise + quarantaine) est un préalable bloquant à toute clôture.
8. Ordre d'exécution de la Phase 1 à ajuster en conséquence : 1.7 (reprise/quarantaine) **avant** 1.5/1.6 si l'on veut des tests sur des données saines.

## Constats complémentaires (hors périmètre Phase 0, non corrigés)

- `mv_balance` est une **vue matérialisée**, alors que 1.6 demande de commencer par une vue simple (et interdit de dépendre d'un rafraîchissement différé en saisie) : `fn_refresh_balance` / `fn_resync_balance` existent.
- `plans_abonnement` : privilèges d'écriture accordés à `authenticated` sans aucune politique correspondante (privilège inutile).
- Aucune table des phases ultérieures n'existe encore : `anomalies`, `referentiels`, `etats_postes`, `baremes`, `journaux` (le compteur de numérotation est nommé `ecriture_sequences`).
- Le module d'anomalies (Phase 2.7) existe en **code client** (`src/lib/anomalies.ts`, 15 tests unitaires verts) mais son écran `src/pages/AnomaliesPage.tsx` n'est **relié à aucune route** de `AppShell` : inaccessible dans l'application.
- `fn_rouvrir_exercice` existe déjà, sans les garde-fous de 2.5 (motif ≥ 20 caractères, notification, contre-passation de l'AN) — à instruire en Phase 2.

## Vérifications de non-régression de cette phase

- `bunx vitest run` : **95 tests / 10 fichiers, tous verts** (dont 15 pour `anomalies.test.ts`).
- `bunx vite build` : succès (3 461 modules).
- Aucun fichier applicatif modifié : le seul fichier ajouté est ce rapport.
