
-- Phase 2 : clôture transactionnelle, affectation du résultat, anomalies, référentiels d'états

-- 1. Machine à états des exercices : ouvert → en_cours_cloture → pre_cloture → cloture → archive
--    ('en_cours' conservé comme synonyme de 'ouvert' pour compatibilité)
ALTER TABLE public.exercices DROP CONSTRAINT exercices_statut_check;
ALTER TABLE public.exercices ADD CONSTRAINT exercices_statut_check
  CHECK (statut IN ('en_cours','ouvert','en_cours_cloture','pre_cloture','cloture','archive'));

-- 2. Table des affectations du résultat
CREATE TABLE public.affectations_resultat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  date_ag DATE NOT NULL,
  resultat NUMERIC(18,2) NOT NULL,
  reserve_legale NUMERIC(18,2) NOT NULL DEFAULT 0,
  reserves_statutaires NUMERIC(18,2) NOT NULL DEFAULT 0,
  report_a_nouveau NUMERIC(18,2) NOT NULL DEFAULT 0,
  dividendes NUMERIC(18,2) NOT NULL DEFAULT 0,
  ecriture_id UUID REFERENCES public.ecritures(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid(),
  UNIQUE (entreprise_id, exercice_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affectations_resultat TO authenticated;
GRANT ALL ON public.affectations_resultat TO service_role;
ALTER TABLE public.affectations_resultat ENABLE ROW LEVEL SECURITY;
CREATE POLICY affectations_select ON public.affectations_resultat FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT entreprise_id FROM public.cabinet_members WHERE user_id = auth.uid()));
CREATE POLICY affectations_write ON public.affectations_resultat FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY affectations_update ON public.affectations_resultat FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id));
CREATE POLICY affectations_delete ON public.affectations_resultat FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));

-- 3. Table des anomalies (contrôles de cohérence)
CREATE TABLE public.anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID REFERENCES public.exercices(id) ON DELETE CASCADE,
  code_controle TEXT NOT NULL,
  gravite TEXT NOT NULL CHECK (gravite IN ('bloquant','alerte','info')),
  message TEXT NOT NULL,
  montant NUMERIC(18,2),
  entite TEXT,
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','justifiee','resolue')),
  justification TEXT,
  justifie_par UUID,
  justifie_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX anomalies_entreprise_exercice_idx ON public.anomalies (entreprise_id, exercice_id, statut);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomalies TO authenticated;
GRANT ALL ON public.anomalies TO service_role;
ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomalies_select ON public.anomalies FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT entreprise_id FROM public.cabinet_members WHERE user_id = auth.uid()));
CREATE POLICY anomalies_insert ON public.anomalies FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY anomalies_update ON public.anomalies FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id));
CREATE POLICY anomalies_delete ON public.anomalies FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));

-- 4. Référentiels d'états financiers versionnés
CREATE TABLE public.referentiels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,           -- ex. 'syscohada_revise'
  systeme TEXT NOT NULL,        -- 'normal' | 'smt'
  date_effet DATE NOT NULL,
  date_fin DATE,
  libelle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, systeme, date_effet)
);
GRANT SELECT ON public.referentiels TO authenticated;
GRANT ALL ON public.referentiels TO service_role;
ALTER TABLE public.referentiels ENABLE ROW LEVEL SECURITY;
CREATE POLICY referentiels_select ON public.referentiels FOR SELECT TO authenticated USING (true);

CREATE TABLE public.etats_postes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referentiel_id UUID NOT NULL REFERENCES public.referentiels(id) ON DELETE CASCADE,
  etat TEXT NOT NULL,           -- 'bilan_actif' | 'bilan_passif' | 'compte_resultat' | 'tft' | 'note'
  code_poste TEXT NOT NULL,     -- ex. 'AD', 'TA', 'XA'
  libelle TEXT NOT NULL,
  formule TEXT NOT NULL,        -- ex. '20+21+22' ou '601:609-602'
  sens TEXT NOT NULL DEFAULT 'debit' CHECK (sens IN ('debit','credit')),
  ordre INT NOT NULL,
  note_renvoi TEXT,
  niveau INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referentiel_id, etat, code_poste)
);
GRANT SELECT ON public.etats_postes TO authenticated;
GRANT ALL ON public.etats_postes TO service_role;
ALTER TABLE public.etats_postes ENABLE ROW LEVEL SECURITY;
CREATE POLICY etats_postes_select ON public.etats_postes FOR SELECT TO authenticated USING (true);

-- 5. Contrôles de cohérence exécutables à la demande
CREATE OR REPLACE FUNCTION public.fn_controles_coherence(_exercice_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ent UUID; v_nb INT := 0;
  v_debut DATE; v_fin DATE;
  v_d NUMERIC(18,2); v_c NUMERIC(18,2);
  v_attente NUMERIC(18,2); v_caisse NUMERIC(18,2);
BEGIN
  SELECT entreprise_id, date_debut, date_fin INTO v_ent, v_debut, v_fin
  FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(v_ent) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;

  -- Purge des anomalies ouvertes issues de contrôles automatiques avant recalcul
  DELETE FROM public.anomalies
  WHERE exercice_id = _exercice_id AND statut = 'ouverte' AND justifie_par IS NULL;

  -- B1 : écritures non validées
  SELECT COUNT(*) INTO v_nb FROM public.ecritures
  WHERE exercice_id = _exercice_id AND statut IN ('brouillon','soumise');
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'ECRITURES_NON_VALIDEES', 'bloquant',
      v_nb || ' écriture(s) en brouillon ou soumise');
  END IF;

  -- B2 : équilibre global de l'exercice
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_d, v_c
  FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee';
  IF v_d <> v_c THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'EQUILIBRE_GLOBAL', 'bloquant',
      'Exercice déséquilibré : débit ' || v_d || ' <> crédit ' || v_c, abs(v_d - v_c));
  END IF;

  -- B3 : écritures hors bornes de l'exercice
  SELECT COUNT(*) INTO v_nb FROM public.ecritures
  WHERE exercice_id = _exercice_id AND statut = 'validee'
    AND (date_ecriture < v_debut OR date_ecriture > v_fin);
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'HORS_BORNES', 'bloquant',
      v_nb || ' écriture(s) validée(s) hors bornes de l''exercice');
  END IF;

  -- B4 : comptes absents du plan comptable
  SELECT COUNT(*) INTO v_nb FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee'
    AND NOT EXISTS (SELECT 1 FROM public.plan_comptable p
                    WHERE p.entreprise_id = v_ent AND p.compte = l.compte);
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'COMPTES_HORS_PLAN', 'bloquant',
      v_nb || ' ligne(s) sur des comptes absents du plan comptable');
  END IF;

  -- A1 : comptes d'attente non soldés (471/472)
  SELECT COALESCE(SUM(l.debit - l.credit),0) INTO v_attente
  FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^(471|472)';
  IF v_attente <> 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'COMPTES_ATTENTE', 'alerte',
      'Comptes d''attente 471/472 non soldés', abs(v_attente));
  END IF;

  -- A2 : caisse créditrice
  SELECT COALESCE(SUM(l.debit - l.credit),0) INTO v_caisse
  FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^57';
  IF v_caisse < 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'CAISSE_CREDITRICE', 'alerte',
      'Caisse créditrice de ' || abs(v_caisse), abs(v_caisse));
  END IF;

  RETURN (SELECT COUNT(*) FROM public.anomalies WHERE exercice_id = _exercice_id AND statut = 'ouverte');
END;
$fn$;

-- 6. Clôture transactionnelle
CREATE OR REPLACE FUNCTION public.fn_cloturer_exercice(_exercice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ent UUID; v_annee INT; v_debut DATE; v_fin DATE;
  v_next_id UUID; v_next_debut DATE; v_next_fin DATE;
  v_bloq INT; v_res NUMERIC(18,2);
  v_cpte_res TEXT; v_lignes JSONB; v_lignes_an JSONB;
  v_od_id UUID; v_an_id UUID;
  r RECORD;
BEGIN
  SELECT entreprise_id, annee, date_debut, date_fin INTO v_ent, v_annee, v_debut, v_fin
  FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN
    RAISE EXCEPTION 'Clôture réservée à l''administrateur';
  END IF;

  -- Verrou consultatif par entreprise
  PERFORM pg_advisory_xact_lock(hashtext(v_ent::text));

  -- Machine à états
  UPDATE public.exercices SET statut = 'en_cours_cloture' WHERE id = _exercice_id;

  -- Contrôles bloquants
  PERFORM public.fn_controles_coherence(_exercice_id);
  SELECT COUNT(*) INTO v_bloq FROM public.anomalies
  WHERE exercice_id = _exercice_id AND statut = 'ouverte' AND gravite = 'bloquant';
  IF v_bloq > 0 THEN
    UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;
    RAISE EXCEPTION 'Clôture impossible : % contrôle(s) bloquant(s) en échec', v_bloq;
  END IF;

  UPDATE public.exercices SET statut = 'pre_cloture' WHERE id = _exercice_id;

  -- Résultat = solde des classes 6, 7, 8 (crédit - débit)
  SELECT COALESCE(SUM(l.credit - l.debit),0) INTO v_res
  FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[678]';

  SELECT compte INTO v_cpte_res FROM public.comptes_systeme
  WHERE (entreprise_id = v_ent OR entreprise_id IS NULL)
    AND role = CASE WHEN v_res >= 0 THEN 'resultat_benefice' ELSE 'resultat_perte' END
  ORDER BY entreprise_id NULLS LAST LIMIT 1;
  IF v_cpte_res IS NULL THEN
    v_cpte_res := CASE WHEN v_res >= 0 THEN '1301' ELSE '1309' END;
  END IF;

  -- OD de clôture : solder chaque compte de gestion vers le compte de résultat
  IF v_res <> 0 OR EXISTS (
    SELECT 1 FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
    WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[678]') THEN
    v_lignes := '[]'::jsonb;
    FOR r IN
      SELECT l.compte, SUM(l.debit) AS d, SUM(l.credit) AS c
      FROM public.ecriture_lignes l
      JOIN public.ecritures e ON e.id = l.ecriture_id
      WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[678]'
      GROUP BY l.compte HAVING SUM(l.debit) <> SUM(l.credit)
    LOOP
      v_lignes := v_lignes || jsonb_build_object('compte', r.compte,
        'intitule', 'Solde de clôture', 'libelle', 'Clôture ' || v_annee,
        'debit', CASE WHEN r.c > r.d THEN r.c - r.d ELSE 0 END,
        'credit', CASE WHEN r.d > r.c THEN r.d - r.c ELSE 0 END);
    END LOOP;
    IF jsonb_array_length(v_lignes) > 0 THEN
      v_lignes := v_lignes || jsonb_build_object('compte', v_cpte_res,
        'intitule', 'Résultat de l''exercice', 'libelle', 'Résultat ' || v_annee,
        'debit', CASE WHEN v_res < 0 THEN -v_res ELSE 0 END,
        'credit', CASE WHEN v_res > 0 THEN v_res ELSE 0 END);
      v_od_id := public.fn_creer_ecriture(v_ent, _exercice_id, 'OD', v_fin,
        'Clôture de l''exercice ' || v_annee, v_lignes, NULL, 'validee', 'cloture');
    END IF;
  END IF;

  -- Exercice N+1
  v_next_debut := v_fin + 1;
  v_next_fin := (v_fin + 1 + INTERVAL '1 year' - INTERVAL '1 day')::date;
  SELECT id INTO v_next_id FROM public.exercices
  WHERE entreprise_id = v_ent AND date_debut = v_next_debut;
  IF v_next_id IS NULL THEN
    INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut)
    VALUES (v_ent, v_annee + 1, v_next_debut, v_next_fin, 'en_cours')
    RETURNING id INTO v_next_id;
  END IF;

  -- À-nouveaux : une ligne par compte de bilan (classes 1-5), après clôture des 6/7/8
  v_lignes_an := '[]'::jsonb;
  FOR r IN
    SELECT l.compte, SUM(l.debit) AS d, SUM(l.credit) AS c
    FROM public.ecriture_lignes l
    JOIN public.ecritures e ON e.id = l.ecriture_id
    WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[1-5]'
    GROUP BY l.compte HAVING SUM(l.debit) <> SUM(l.credit)
    ORDER BY l.compte
  LOOP
    v_lignes_an := v_lignes_an || jsonb_build_object('compte', r.compte,
      'intitule', 'À nouveau', 'libelle', 'Report à nouveau ' || (v_annee + 1),
      'debit', CASE WHEN r.d > r.c THEN r.d - r.c ELSE 0 END,
      'credit', CASE WHEN r.c > r.d THEN r.c - r.d ELSE 0 END);
  END LOOP;
  IF jsonb_array_length(v_lignes_an) >= 2 THEN
    v_an_id := public.fn_creer_ecriture(v_ent, v_next_id, 'AN', v_next_debut,
      'À-nouveaux de l''exercice ' || (v_annee + 1), v_lignes_an, NULL, 'validee', 'cloture');
  END IF;

  -- Clôture effective
  UPDATE public.exercices SET statut = 'cloture' WHERE id = _exercice_id;

  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'CLOTURE', jsonb_build_object(
    'annee', v_annee, 'resultat', v_res, 'od_cloture', v_od_id,
    'an_n1', v_an_id, 'exercice_n1', v_next_id), auth.uid());

  RETURN v_next_id;
END;
$fn$;

-- 7. Affectation du résultat (après AG)
CREATE OR REPLACE FUNCTION public.fn_affecter_resultat(
  _exercice_id UUID, _date_ag DATE,
  _reserve_legale NUMERIC, _reserves_statutaires NUMERIC,
  _report_a_nouveau NUMERIC, _dividendes NUMERIC)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ent UUID; v_res NUMERIC(18,2); v_somme NUMERIC(18,2);
  v_next_id UUID; v_next_debut DATE;
  v_c_res TEXT; v_c_rl TEXT; v_c_rs TEXT; v_c_ran TEXT; v_c_div TEXT;
  v_lignes JSONB := '[]'::jsonb; v_id UUID;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN
    RAISE EXCEPTION 'Affectation réservée à l''administrateur';
  END IF;

  -- Résultat comptable de l'exercice
  SELECT COALESCE(SUM(l.credit - l.debit),0) INTO v_res
  FROM public.ecriture_lignes l
  JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[678]';
  -- Après clôture, les 6/7/8 sont soldés : reprendre le solde du compte de résultat
  IF v_res = 0 THEN
    SELECT COALESCE(SUM(l.credit - l.debit),0) INTO v_res
    FROM public.ecriture_lignes l
    JOIN public.ecritures e ON e.id = l.ecriture_id
    WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^13';
  END IF;

  v_somme := COALESCE(_reserve_legale,0) + COALESCE(_reserves_statutaires,0)
           + COALESCE(_report_a_nouveau,0) + COALESCE(_dividendes,0);
  IF v_res >= 0 AND v_somme <> v_res THEN
    RAISE EXCEPTION 'La somme des affectations (%) doit égaler le résultat (%)', v_somme, v_res;
  END IF;
  IF v_res < 0 AND (COALESCE(_reserve_legale,0) <> 0 OR COALESCE(_dividendes,0) <> 0) THEN
    RAISE EXCEPTION 'En cas de perte, affectation au report à nouveau débiteur uniquement';
  END IF;

  -- Comptes système
  SELECT compte INTO v_c_res FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = CASE WHEN v_res >= 0 THEN 'resultat_benefice' ELSE 'resultat_perte' END ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_rl  FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'reserve_legale' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_rs  FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'reserves_statutaires' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_ran FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = CASE WHEN v_res >= 0 THEN 'ran_crediteur' ELSE 'ran_debiteur' END ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_div FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'dividendes_a_payer' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  v_c_res := COALESCE(v_c_res, CASE WHEN v_res >= 0 THEN '1301' ELSE '1309' END);
  v_c_rl  := COALESCE(v_c_rl, '111'); v_c_rs := COALESCE(v_c_rs, '112');
  v_c_ran := COALESCE(v_c_ran, CASE WHEN v_res >= 0 THEN '121' ELSE '129' END);
  v_c_div := COALESCE(v_c_div, '465');

  -- Écriture d'affectation sur l'exercice suivant (N+1), datée du jour de l'AG
  SELECT id, date_debut INTO v_next_id, v_next_debut FROM public.exercices
  WHERE entreprise_id = v_ent AND date_debut > (SELECT date_fin FROM public.exercices WHERE id = _exercice_id)
  ORDER BY date_debut LIMIT 1;
  IF v_next_id IS NULL THEN RAISE EXCEPTION 'Exercice suivant introuvable : clôturez d''abord l''exercice'; END IF;

  IF v_res >= 0 THEN
    v_lignes := v_lignes || jsonb_build_object('compte', v_c_res, 'intitule', 'Résultat à affecter', 'debit', v_res, 'credit', 0);
    IF COALESCE(_reserve_legale,0) > 0 THEN v_lignes := v_lignes || jsonb_build_object('compte', v_c_rl, 'intitule', 'Réserve légale', 'debit', 0, 'credit', _reserve_legale); END IF;
    IF COALESCE(_reserves_statutaires,0) > 0 THEN v_lignes := v_lignes || jsonb_build_object('compte', v_c_rs, 'intitule', 'Réserves statutaires', 'debit', 0, 'credit', _reserves_statutaires); END IF;
    IF COALESCE(_report_a_nouveau,0) > 0 THEN v_lignes := v_lignes || jsonb_build_object('compte', v_c_ran, 'intitule', 'Report à nouveau', 'debit', 0, 'credit', _report_a_nouveau); END IF;
    IF COALESCE(_dividendes,0) > 0 THEN v_lignes := v_lignes || jsonb_build_object('compte', v_c_div, 'intitule', 'Dividendes à payer', 'debit', 0, 'credit', _dividendes); END IF;
  ELSE
    v_lignes := v_lignes || jsonb_build_object('compte', v_c_ran, 'intitule', 'Report à nouveau débiteur', 'debit', -v_res, 'credit', 0);
    v_lignes := v_lignes || jsonb_build_object('compte', v_c_res, 'intitule', 'Perte de l''exercice', 'debit', 0, 'credit', -v_res);
  END IF;

  v_id := public.fn_creer_ecriture(v_ent, v_next_id, 'OD', GREATEST(_date_ag, v_next_debut),
    'Affectation du résultat (AG du ' || _date_ag || ')', v_lignes, NULL, 'validee', 'cloture');

  INSERT INTO public.affectations_resultat (entreprise_id, exercice_id, date_ag, resultat,
    reserve_legale, reserves_statutaires, report_a_nouveau, dividendes, ecriture_id)
  VALUES (v_ent, _exercice_id, _date_ag, v_res, COALESCE(_reserve_legale,0),
    COALESCE(_reserves_statutaires,0), COALESCE(_report_a_nouveau,0), COALESCE(_dividendes,0), v_id)
  ON CONFLICT (entreprise_id, exercice_id) DO NOTHING;

  RETURN v_id;
END;
$fn$;

-- 8. Réouverture exceptionnelle durcie : motif ≥ 20 caractères, notification des membres
CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id UUID, _motif TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ent UUID; v_next_id UUID; v_an RECORD; m RECORD;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN
    RAISE EXCEPTION 'Réouverture réservée à l''administrateur';
  END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 20 THEN
    RAISE EXCEPTION 'Motif de réouverture obligatoire (20 caractères minimum)';
  END IF;

  -- Si N+1 contient l'AN généré par la clôture : contre-passation (jamais suppression)
  SELECT id INTO v_next_id FROM public.exercices
  WHERE entreprise_id = v_ent AND date_debut > (SELECT date_fin FROM public.exercices WHERE id = _exercice_id)
  ORDER BY date_debut LIMIT 1;
  IF v_next_id IS NOT NULL THEN
    FOR v_an IN SELECT id FROM public.ecritures
      WHERE exercice_id = v_next_id AND journal_code = 'AN' AND origine = 'cloture'
        AND statut = 'validee' AND contrepasse_par IS NULL
    LOOP
      PERFORM public.fn_contrepasser_ecriture(v_an.id, 'Réouverture de l''exercice N : ' || _motif);
    END LOOP;
  END IF;

  UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;

  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());

  -- Notification à tous les membres du cabinet
  FOR m IN SELECT user_id FROM public.cabinet_members WHERE entreprise_id = v_ent
  LOOP
    INSERT INTO public.notifications (user_id, titre, message, type)
    VALUES (m.user_id, 'Réouverture d''exercice',
      'Un exercice a été réouvert. Motif : ' || _motif, 'alerte');
  END LOOP;
END;
$fn$;
