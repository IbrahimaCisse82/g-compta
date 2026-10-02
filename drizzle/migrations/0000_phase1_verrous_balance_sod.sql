-- CA-1.3 : aucune écriture client sur balance (table conservée en lecture seule, R2)
REVOKE INSERT, UPDATE, DELETE ON public.balance FROM authenticated, anon;
-- CA-1.2 : aucune suppression physique de ligne de journal par l'API
REVOKE DELETE ON public.journal FROM authenticated, anon;
-- Lecture anonyme limitée aux politiques démo : retirer tout droit d'écriture anon
REVOKE INSERT, UPDATE, DELETE ON public.journal FROM anon;

-- CA-1.4 : ségrégation des tâches appliquée en base
CREATE OR REPLACE FUNCTION public.fn_valider_ecriture(_ecriture_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e public.ecritures%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.ecritures WHERE id = _ecriture_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ecriture introuvable'; END IF;
  IF NOT public.can_write_entreprise(e.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF e.statut <> 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut etre valide'; END IF;
  IF e.created_by IS NOT NULL AND e.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Separation des taches : vous ne pouvez pas valider votre propre ecriture';
  END IF;
  IF round(e.total_debit,2) <> round(e.total_credit,2) OR e.total_debit = 0 THEN
    RAISE EXCEPTION 'Ecriture desequilibree : validation refusee';
  END IF;
  UPDATE public.ecritures SET statut = 'validee', valide_par = auth.uid(), valide_le = now()
   WHERE id = _ecriture_id;
  INSERT INTO public.journal_audit (entreprise_id, exercice_id, action, new_data, user_id)
  VALUES (e.entreprise_id, e.exercice_id, 'ECRITURE_VALIDEE',
    jsonb_build_object('ecriture_id', _ecriture_id, 'numero', e.numero), auth.uid());
END; $function$;
REVOKE EXECUTE ON FUNCTION public.fn_valider_ecriture(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_valider_ecriture(uuid) TO authenticated;

-- Ségrégation aussi sur le circuit de validation du journal historique
CREATE OR REPLACE FUNCTION public.trg_journal_sod() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.statut_validation = 'valide' AND OLD.statut_validation IS DISTINCT FROM 'valide'
     AND NEW.soumis_par IS NOT NULL AND NEW.soumis_par = auth.uid() THEN
    RAISE EXCEPTION 'Separation des taches : l''auteur ne peut pas valider sa propre soumission';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS journal_sod ON public.journal;
CREATE TRIGGER journal_sod BEFORE UPDATE ON public.journal FOR EACH ROW EXECUTE FUNCTION public.trg_journal_sod();