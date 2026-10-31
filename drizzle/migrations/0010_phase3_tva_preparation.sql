ALTER TABLE public.declarations_tva
 ADD COLUMN calcul_version integer NOT NULL DEFAULT 1,
 ADD COLUMN prorata numeric(8,4) NOT NULL DEFAULT 100,
 ADD COLUMN tva_non_recuperable numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN autoliquidation numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN autoliquidation_non_recuperable numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN retenues_subies numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN deduction_admise numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN credit_reportable numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN detail_calcul jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.declarations_tva TO authenticated;
GRANT ALL ON public.declarations_tva TO service_role;
ALTER TABLE public.declarations_tva ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.trg_tva_preparation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ent uuid; v_ex public.exercices%ROWTYPE; v_credit numeric(18,2); v_collectee numeric(18,2); v_ded numeric(18,2); v_solde numeric(18,2);
BEGIN
 v_ent := CASE WHEN TG_OP='DELETE' THEN OLD.entreprise_id ELSE NEW.entreprise_id END;
 IF auth.uid() IS NOT NULL AND NOT COALESCE(public.can_write_entreprise(v_ent),false) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.statut='validee' THEN RAISE EXCEPTION 'Declaration validee : modification ou suppression interdite'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.entreprise_id,NEW.exercice_id) IS DISTINCT FROM (OLD.entreprise_id,OLD.exercice_id) THEN RAISE EXCEPTION 'Rattachement de declaration immuable'; END IF;
 SELECT * INTO v_ex FROM public.exercices WHERE id=NEW.exercice_id FOR UPDATE;
 IF v_ex.id IS NULL OR v_ex.entreprise_id<>NEW.entreprise_id THEN RAISE EXCEPTION 'Exercice incompatible'; END IF;
 IF v_ex.statut<>'en_cours' THEN RAISE EXCEPTION 'Exercice non ouvert'; END IF;
 IF NEW.date_debut>NEW.date_fin OR NEW.date_debut<v_ex.date_debut OR NEW.date_fin>v_ex.date_fin THEN RAISE EXCEPTION 'Periode hors exercice ou invalide'; END IF;
 IF NEW.calcul_version=2 THEN
  IF NEW.statut<>'brouillon' THEN RAISE EXCEPTION 'Liquidation complete non disponible : conserver le brouillon'; END IF;
  IF NOT public.periode_est_ouverte(NEW.exercice_id,NEW.date_fin) THEN RAISE EXCEPTION 'Periode verrouillee'; END IF;
  IF EXISTS(SELECT 1 FROM public.declarations_tva d WHERE d.entreprise_id=NEW.entreprise_id AND d.id<>NEW.id AND d.date_debut<=NEW.date_fin AND d.date_fin>=NEW.date_debut) THEN RAISE EXCEPTION 'Une declaration couvre deja cette periode'; END IF;
  IF NEW.prorata<0 OR NEW.prorata>100 OR NEW.prorata::text='NaN' OR NEW.tva_non_recuperable<0 OR NEW.autoliquidation<0 OR NEW.autoliquidation_non_recuperable<0 OR NEW.retenues_subies<0 OR NEW.tva_non_recuperable>greatest(0,NEW.tva_deductible) OR NEW.autoliquidation_non_recuperable>NEW.autoliquidation THEN RAISE EXCEPTION 'Ajustements TVA invalides'; END IF;
  IF NEW.tva_collectee::text='NaN' OR NEW.tva_deductible::text='NaN' OR NEW.tva_non_recuperable::text='NaN' OR NEW.autoliquidation::text='NaN' OR NEW.autoliquidation_non_recuperable::text='NaN' OR NEW.retenues_subies::text='NaN' THEN RAISE EXCEPTION 'Montants invalides'; END IF;
  SELECT CASE WHEN d.calcul_version=2 THEN d.credit_reportable ELSE greatest(0,-d.tva_a_payer) END INTO v_credit FROM public.declarations_tva d WHERE d.entreprise_id=NEW.entreprise_id AND d.statut='validee' AND d.date_fin<NEW.date_debut ORDER BY d.date_fin DESC LIMIT 1;
  NEW.credit_precedent:=coalesce(v_credit,0);
  v_collectee:=round(NEW.tva_collectee,2)+NEW.autoliquidation;
  v_ded:=round((round(NEW.tva_deductible,2)-NEW.tva_non_recuperable+NEW.autoliquidation-NEW.autoliquidation_non_recuperable)*NEW.prorata/100,2);
  NEW.deduction_admise:=v_ded;
  NEW.tva_nette:=v_collectee-v_ded;
  v_solde:=NEW.tva_nette-NEW.credit_precedent-NEW.retenues_subies;
  NEW.tva_a_payer:=greatest(0,v_solde);
  NEW.credit_reportable:=greatest(0,-v_solde);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_tva_preparation() FROM PUBLIC, anon;
CREATE TRIGGER tva_preparation BEFORE INSERT OR UPDATE OR DELETE ON public.declarations_tva FOR EACH ROW EXECUTE FUNCTION public.trg_tva_preparation();
CREATE TRIGGER audit_declarations_tva AFTER INSERT OR UPDATE OR DELETE ON public.declarations_tva FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();