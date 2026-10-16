CREATE OR REPLACE FUNCTION public.fn_controles_coherence(_exercice_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ent UUID; v_nb INT := 0; v_debut DATE; v_fin DATE;
  v_d NUMERIC(18,2); v_c NUMERIC(18,2); v_attente NUMERIC(18,2); v_caisse NUMERIC(18,2);
BEGIN
  SELECT entreprise_id, date_debut, date_fin INTO v_ent, v_debut, v_fin FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(v_ent) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  DELETE FROM public.anomalies WHERE exercice_id = _exercice_id AND statut = 'ouverte' AND justifie_par IS NULL;

  SELECT COUNT(*) INTO v_nb FROM public.ecritures WHERE exercice_id = _exercice_id AND statut IN ('brouillon','soumise');
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'ECRITURES_NON_VALIDEES', 'bloquant', v_nb || ' écriture(s) en brouillon ou soumise');
  END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_d, v_c
  FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee';
  IF v_d <> v_c THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'EQUILIBRE_GLOBAL', 'bloquant', 'Exercice déséquilibré : débit ' || v_d || ' <> crédit ' || v_c, abs(v_d - v_c));
  END IF;

  SELECT COUNT(*) INTO v_nb FROM public.ecritures
  WHERE exercice_id = _exercice_id AND statut = 'validee' AND (date_ecriture < v_debut OR date_ecriture > v_fin);
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'HORS_BORNES', 'bloquant', v_nb || ' écriture(s) validée(s) hors bornes de l''exercice');
  END IF;

  -- B4 : comptes absents du plan (un compte détaillé est admis s'il descend d'un compte du plan)
  SELECT COUNT(*) INTO v_nb FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee'
    AND NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.entreprise_id = v_ent AND l.compte LIKE p.numero || '%');
  IF v_nb > 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message)
    VALUES (v_ent, _exercice_id, 'COMPTES_HORS_PLAN', 'bloquant', v_nb || ' ligne(s) sur des comptes absents du plan comptable');
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit),0) INTO v_attente FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^(471|472)';
  IF v_attente <> 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'COMPTES_ATTENTE', 'alerte', 'Comptes d''attente 471/472 non soldés', abs(v_attente));
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit),0) INTO v_caisse FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
  WHERE l.exercice_id = _exercice_id AND e.statut = 'validee' AND l.compte ~ '^57';
  IF v_caisse < 0 THEN
    INSERT INTO public.anomalies (entreprise_id, exercice_id, code_controle, gravite, message, montant)
    VALUES (v_ent, _exercice_id, 'CAISSE_CREDITRICE', 'alerte', 'Caisse créditrice de ' || abs(v_caisse), abs(v_caisse));
  END IF;

  RETURN (SELECT COUNT(*) FROM public.anomalies WHERE exercice_id = _exercice_id AND statut = 'ouverte');
END;
$function$;