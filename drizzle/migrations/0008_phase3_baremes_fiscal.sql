CREATE TABLE public.baremes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  libelle text NOT NULL,
  valeur numeric(18,6) NOT NULL,
  date_effet date NOT NULL,
  date_fin date,
  a_valider boolean NOT NULL DEFAULT true,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, date_effet)
);
GRANT SELECT ON public.baremes TO authenticated;
GRANT ALL ON public.baremes TO service_role;
ALTER TABLE public.baremes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baremes lecture" ON public.baremes FOR SELECT TO authenticated USING (true);

INSERT INTO public.baremes (code, libelle, valeur, date_effet, source) VALUES
 ('IS_TAUX','Taux de l''impôt sur les sociétés',0.30,'2013-01-01','CGI Sénégal art. 7 — À VALIDER'),
 ('IMF_TAUX','Taux IMF sur chiffre d''affaires HT',0.005,'2013-01-01','CGI Sénégal art. 33 — À VALIDER'),
 ('IMF_PLANCHER','Plancher IMF (FCFA)',500000,'2013-01-01','CGI Sénégal art. 33 — À VALIDER'),
 ('IMF_PLAFOND','Plafond IMF (FCFA)',5000000,'2013-01-01','CGI Sénégal art. 33 — À VALIDER'),
 ('ACOMPTE_FRACTION','Fraction de l''impôt N-1 par acompte',0.333333,'2013-01-01','À VALIDER');

CREATE TABLE public.passage_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id),
  exercice_id uuid NOT NULL REFERENCES public.exercices(id),
  sens text NOT NULL CHECK (sens IN ('reintegration','deduction')),
  nature text NOT NULL,
  libelle text NOT NULL,
  montant numeric(18,2) NOT NULL CHECK (montant >= 0),
  ecriture_id uuid REFERENCES public.ecritures(id),
  immobilisation_id uuid REFERENCES public.immobilisations(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passage_fiscal TO authenticated;
GRANT ALL ON public.passage_fiscal TO service_role;
ALTER TABLE public.passage_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passage lecture" ON public.passage_fiscal FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "passage ajout" ON public.passage_fiscal FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id) AND NOT public.exercice_est_cloture(exercice_id));
CREATE POLICY "passage modif" ON public.passage_fiscal FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id) AND NOT public.exercice_est_cloture(exercice_id));
CREATE POLICY "passage suppr" ON public.passage_fiscal FOR DELETE TO authenticated
  USING (public.can_write_entreprise(entreprise_id) AND NOT public.exercice_est_cloture(exercice_id));
CREATE TRIGGER trg_audit_passage_fiscal AFTER INSERT OR UPDATE OR DELETE ON public.passage_fiscal
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();