-- ══════════════════════════════════════════════════════════
-- A9 — VERROUILLAGE DE PÉRIODE (mensuel, fin granulaire)
-- ══════════════════════════════════════════════════════════
-- Complète le verrou d'exercice (exercice_est_cloture) par un verrou mensuel :
-- l'admin peut verrouiller un mois clos sans clôturer tout l'exercice. Toute
-- saisie/modification d'écriture datée d'un mois verrouillé est rejetée en base.

CREATE TABLE IF NOT EXISTS public.periodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  mois date NOT NULL,                       -- premier jour du mois (YYYY-MM-01)
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'verrouille')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercice_id, mois)
);
GRANT SELECT ON public.periodes TO authenticated;
GRANT ALL ON public.periodes TO service_role;
ALTER TABLE public.periodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own periodes" ON public.periodes FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Admins manage periodes" ON public.periodes FOR ALL TO authenticated
  USING (public.can_admin_entreprise(entreprise_id))
  WITH CHECK (public.can_admin_entreprise(entreprise_id));

-- Le mois contenant _date est-il verrouillé pour cet exercice ?
CREATE OR REPLACE FUNCTION public.periode_est_verrouillee(_exercice_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.statut = 'verrouille' FROM public.periodes p
    WHERE p.exercice_id = _exercice_id
      AND p.mois = date_trunc('month', _date)::date
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.periode_est_verrouillee(uuid, date) TO authenticated;

-- Verrouille / déverrouille un mois (réservé à l'admin, exercice non clôturé)
CREATE OR REPLACE FUNCTION public.fn_verrouiller_periode(_exercice_id uuid, _mois date, _verrouille boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN
    RAISE EXCEPTION 'Verrouillage de periode reserve a l''administrateur';
  END IF;
  IF public.exercice_est_cloture(_exercice_id) THEN
    RAISE EXCEPTION 'Exercice cloture : periodes non modifiables';
  END IF;
  INSERT INTO public.periodes (entreprise_id, exercice_id, mois, statut)
  VALUES (v_ent, _exercice_id, date_trunc('month', _mois)::date,
          CASE WHEN _verrouille THEN 'verrouille' ELSE 'ouvert' END)
  ON CONFLICT (exercice_id, mois) DO UPDATE SET statut = EXCLUDED.statut;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_verrouiller_periode(uuid, date, boolean) TO authenticated;

-- Auto-création des 12 périodes mensuelles à la création d'un exercice
CREATE OR REPLACE FUNCTION public.trg_exercices_periodes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date;
BEGIN
  m := date_trunc('month', NEW.date_debut)::date;
  WHILE m <= date_trunc('month', NEW.date_fin)::date LOOP
    INSERT INTO public.periodes (entreprise_id, exercice_id, mois, statut)
    VALUES (NEW.entreprise_id, NEW.id, m, 'ouvert')
    ON CONFLICT (exercice_id, mois) DO NOTHING;
    m := (m + interval '1 month')::date;
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS exercices_periodes ON public.exercices;
CREATE TRIGGER exercices_periodes AFTER INSERT ON public.exercices
  FOR EACH ROW EXECUTE FUNCTION public.trg_exercices_periodes();

-- Verrouille toutes les périodes à la clôture ; réouvre à la réouverture
CREATE OR REPLACE FUNCTION public.trg_exercices_cloture_periodes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.statut <> 'cloture' AND NEW.statut = 'cloture' THEN
    UPDATE public.periodes SET statut = 'verrouille' WHERE exercice_id = NEW.id;
  ELSIF OLD.statut = 'cloture' AND NEW.statut <> 'cloture' THEN
    UPDATE public.periodes SET statut = 'ouvert' WHERE exercice_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS exercices_cloture_periodes ON public.exercices;
CREATE TRIGGER exercices_cloture_periodes AFTER UPDATE OF statut ON public.exercices
  FOR EACH ROW EXECUTE FUNCTION public.trg_exercices_cloture_periodes();

-- Le trigger de période d'écriture vérifie aussi le verrou mensuel
CREATE OR REPLACE FUNCTION public.trg_ecritures_periode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exc uuid; v_dat date;
BEGIN
  v_exc := COALESCE(NEW.exercice_id, OLD.exercice_id);
  v_dat := COALESCE(NEW.date_ecriture, OLD.date_ecriture);
  IF public.exercice_est_cloture(v_exc) THEN
    RAISE EXCEPTION 'Exercice cloture : aucune ecriture ne peut etre enregistree ou modifiee';
  END IF;
  IF public.periode_est_verrouillee(v_exc, v_dat) THEN
    RAISE EXCEPTION 'Periode verrouillee : saisie interdite pour ce mois';
  END IF;
  RETURN NEW;
END; $$;

-- Correctif : fn_rouvrir_exercice utilisait 'ouvert' (hors CHECK en_cours/cloture)
CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Reouverture reservee a l''administrateur'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif de reouverture obligatoire'; END IF;
  UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());
END; $$;

-- Backfill : crée les périodes des exercices existants
DO $$
DECLARE ex RECORD; m date;
BEGIN
  FOR ex IN SELECT id, entreprise_id, date_debut, date_fin FROM public.exercices LOOP
    m := date_trunc('month', ex.date_debut)::date;
    WHILE m <= date_trunc('month', ex.date_fin)::date LOOP
      INSERT INTO public.periodes (entreprise_id, exercice_id, mois, statut)
      VALUES (ex.entreprise_id, ex.id, m,
              CASE WHEN ex.statut = 'cloture' THEN 'verrouille' ELSE 'ouvert' END)
      ON CONFLICT (exercice_id, mois) DO NOTHING;
      m := (m + interval '1 month')::date;
    END LOOP;
  END LOOP;
END $$;
