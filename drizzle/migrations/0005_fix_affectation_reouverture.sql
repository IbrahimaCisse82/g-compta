CREATE OR REPLACE FUNCTION public.fn_affecter_resultat(_exercice_id uuid, _date_ag date, _reserve_legale numeric, _reserves_statutaires numeric, _report_a_nouveau numeric, _dividendes numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ent UUID; v_res NUMERIC(18,2); v_somme NUMERIC(18,2);
  v_next_id UUID; v_next_debut DATE;
  v_c_res TEXT; v_c_rl TEXT; v_c_rs TEXT; v_c_ran TEXT; v_c_div TEXT;
  v_lignes JSONB := '[]'::jsonb; v_id UUID;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Affectation réservée à l''administrateur'; END IF;
  IF EXISTS (SELECT 1 FROM public.affectations_resultat WHERE entreprise_id = v_ent AND exercice_id = _exercice_id) THEN
    RAISE EXCEPTION 'Le résultat de cet exercice a déjà été affecté';
  END IF;

  SELECT COALESCE(SUM(l.credit - l.debit),0) INTO v_res FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^[678]';
  IF v_res = 0 THEN
    SELECT COALESCE(SUM(l.credit - l.debit),0) INTO v_res FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
    WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^13';
  END IF;

  v_somme := COALESCE(_reserve_legale,0) + COALESCE(_reserves_statutaires,0) + COALESCE(_report_a_nouveau,0) + COALESCE(_dividendes,0);
  IF v_res >= 0 AND v_somme <> v_res THEN
    RAISE EXCEPTION 'La somme des affectations (%) doit égaler le résultat (%)', v_somme, v_res;
  END IF;
  IF v_res < 0 AND (COALESCE(_reserve_legale,0) <> 0 OR COALESCE(_dividendes,0) <> 0) THEN
    RAISE EXCEPTION 'En cas de perte, affectation au report à nouveau débiteur uniquement';
  END IF;

  SELECT compte INTO v_c_res FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = CASE WHEN v_res >= 0 THEN 'resultat_benefice' ELSE 'resultat_perte' END ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_rl  FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'reserve_legale' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_rs  FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'reserves_statutaires' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_ran FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = CASE WHEN v_res >= 0 THEN 'ran_crediteur' ELSE 'ran_debiteur' END ORDER BY entreprise_id NULLS LAST LIMIT 1;
  SELECT compte INTO v_c_div FROM public.comptes_systeme WHERE (entreprise_id = v_ent OR entreprise_id IS NULL) AND role = 'dividendes_a_payer' ORDER BY entreprise_id NULLS LAST LIMIT 1;
  v_c_res := COALESCE(v_c_res, CASE WHEN v_res >= 0 THEN '1301' ELSE '1309' END);
  v_c_rl  := COALESCE(v_c_rl, '111'); v_c_rs := COALESCE(v_c_rs, '112');
  v_c_ran := COALESCE(v_c_ran, CASE WHEN v_res >= 0 THEN '121' ELSE '129' END);
  v_c_div := COALESCE(v_c_div, '465');

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
    'Affectation du résultat (AG du ' || _date_ag || ')', v_lignes, NULL, 'validee', 'affectation');

  INSERT INTO public.affectations_resultat (entreprise_id, exercice_id, date_ag, resultat,
    reserve_legale, reserves_statutaires, report_a_nouveau, dividendes, ecriture_id, created_by)
  VALUES (v_ent, _exercice_id, _date_ag, v_res, COALESCE(_reserve_legale,0),
    COALESCE(_reserves_statutaires,0), COALESCE(_report_a_nouveau,0), COALESCE(_dividendes,0), v_id, auth.uid());
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ent UUID; v_cab UUID; v_next_id UUID; v_an RECORD; m RECORD;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Réouverture réservée à l''administrateur'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 20 THEN
    RAISE EXCEPTION 'Motif de réouverture obligatoire (20 caractères minimum)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.affectations_resultat WHERE exercice_id = _exercice_id) THEN
    RAISE EXCEPTION 'Réouverture impossible : le résultat a déjà été affecté par l''assemblée générale';
  END IF;

  SELECT id INTO v_next_id FROM public.exercices
  WHERE entreprise_id = v_ent AND date_debut > (SELECT date_fin FROM public.exercices WHERE id = _exercice_id)
  ORDER BY date_debut LIMIT 1;
  IF v_next_id IS NOT NULL THEN
    FOR v_an IN SELECT id FROM public.ecritures
      WHERE exercice_id = v_next_id AND journal_code = 'AN' AND origine = 'cloture'
        AND statut = 'validee' AND contrepasse_par IS NULL AND contrepassation_de IS NULL
    LOOP
      PERFORM public.fn_contrepasser_ecriture(v_an.id, 'Réouverture de l''exercice N : ' || _motif);
    END LOOP;
  END IF;

  UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;

  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());

  SELECT cabinet_id INTO v_cab FROM public.entreprises WHERE id = v_ent;
  FOR m IN
    SELECT user_id FROM public.cabinet_members WHERE v_cab IS NOT NULL AND cabinet_id = v_cab
    UNION SELECT user_id FROM public.entreprises WHERE id = v_ent AND user_id IS NOT NULL
    UNION SELECT user_id FROM public.user_roles WHERE entreprise_id = v_ent
  LOOP
    INSERT INTO public.notifications (entreprise_id, user_id, titre, message, type)
    VALUES (v_ent, m.user_id, 'Réouverture d''exercice', 'Un exercice a été réouvert. Motif : ' || _motif, 'alerte');
  END LOOP;
END;
$function$;