-- R4 sans réécriture de table : contrainte de précision 2 décimales sur les montants comptables
ALTER TABLE public.journal ADD CONSTRAINT journal_montants_2dec CHECK (debit = round(debit,2) AND credit = round(credit,2) AND debit >= 0 AND credit >= 0) NOT VALID;
ALTER TABLE public.factures ADD CONSTRAINT factures_montants_2dec CHECK (total_ht = round(total_ht,2) AND total_tva = round(total_tva,2) AND total_ttc = round(total_ttc,2)) NOT VALID;
ALTER TABLE public.bulletins_paie ADD CONSTRAINT bulletins_net_2dec CHECK (net_payer IS NULL OR net_payer = round(net_payer,2)) NOT VALID;

-- 1.5 Périodes comptables
CREATE TABLE public.periodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','verrouillee','cloturee')),
  verrouille_par uuid,
  verrouille_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_fin >= date_debut),
  UNIQUE (exercice_id, date_debut)
);
GRANT SELECT ON public.periodes TO authenticated;
GRANT ALL ON public.periodes TO service_role;
ALTER TABLE public.periodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY periodes_sel ON public.periodes FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.periode_est_ouverte(_exercice_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.periodes p
    WHERE p.exercice_id = _exercice_id AND _date BETWEEN p.date_debut AND p.date_fin AND p.statut <> 'ouverte');
$$;

CREATE OR REPLACE FUNCTION public.fn_verrouiller_periode(_exercice_id uuid, _date_debut date, _date_fin date, _statut text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Verrouillage reserve a l''administrateur'; END IF;
  IF _statut NOT IN ('ouverte','verrouillee','cloturee') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
  INSERT INTO public.periodes (entreprise_id, exercice_id, date_debut, date_fin, statut, verrouille_par, verrouille_le)
  VALUES (v_ent, _exercice_id, _date_debut, _date_fin, _statut, auth.uid(), now())
  ON CONFLICT (exercice_id, date_debut) DO UPDATE SET statut = EXCLUDED.statut, date_fin = EXCLUDED.date_fin,
    verrouille_par = auth.uid(), verrouille_le = now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_verrouiller_periode(uuid,date,date,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_verrouiller_periode(uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_ecritures_periode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex public.exercices%ROWTYPE;
BEGIN
  IF public.exercice_est_cloture(COALESCE(NEW.exercice_id, OLD.exercice_id)) THEN
    RAISE EXCEPTION 'Exercice cloture : aucune ecriture ne peut etre enregistree ou modifiee';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO ex FROM public.exercices WHERE id = NEW.exercice_id;
    IF NEW.date_ecriture < ex.date_debut OR NEW.date_ecriture > ex.date_fin THEN
      RAISE EXCEPTION 'Date % hors exercice (% -> %)', NEW.date_ecriture, ex.date_debut, ex.date_fin;
    END IF;
    IF NOT public.periode_est_ouverte(NEW.exercice_id, NEW.date_ecriture) THEN
      RAISE EXCEPTION 'Periode verrouillee : saisie impossible au %', NEW.date_ecriture;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 2.1 Comptes système (R6) — valeurs par défaut SYSCOHADA, ⚠ À VALIDER par l'expert-comptable
CREATE TABLE public.comptes_systeme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE CASCADE,
  role text NOT NULL,
  compte text NOT NULL,
  libelle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, role)
);
GRANT SELECT ON public.comptes_systeme TO authenticated;
GRANT INSERT, UPDATE ON public.comptes_systeme TO authenticated;
GRANT ALL ON public.comptes_systeme TO service_role;
ALTER TABLE public.comptes_systeme ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_sel ON public.comptes_systeme FOR SELECT TO authenticated
  USING (entreprise_id IS NULL OR entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY cs_ins ON public.comptes_systeme FOR INSERT TO authenticated
  WITH CHECK (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id));
CREATE POLICY cs_upd ON public.comptes_systeme FOR UPDATE TO authenticated
  USING (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id))
  WITH CHECK (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id));
INSERT INTO public.comptes_systeme (entreprise_id, role, compte, libelle) VALUES
 (NULL,'resultat_benefice','1301','Résultat net : bénéfice'),
 (NULL,'resultat_perte','1309','Résultat net : perte'),
 (NULL,'resultat_instance','1300','Résultat en instance d''affectation'),
 (NULL,'ran_crediteur','121','Report à nouveau créditeur'),
 (NULL,'ran_debiteur','129','Report à nouveau débiteur'),
 (NULL,'reserve_legale','111','Réserve légale'),
 (NULL,'reserves_statutaires','112','Réserves statutaires'),
 (NULL,'dividendes_a_payer','465','Associés, dividendes à payer'),
 (NULL,'ecart_conversion_actif','478','Écarts de conversion actif'),
 (NULL,'ecart_conversion_passif','479','Écarts de conversion passif'),
 (NULL,'tva_collectee','4431','TVA facturée sur ventes'),
 (NULL,'tva_deductible','4452','TVA récupérable sur achats'),
 (NULL,'tva_due','4441','État, TVA due'),
 (NULL,'credit_tva','4449','État, crédit de TVA à reporter');

-- 1.8 Piste d'audit en ajout seul, chaînée par hash
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  entreprise_id uuid,
  table_name text NOT NULL,
  operation text NOT NULL,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  hash_precedent text,
  hash text NOT NULL
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_sel ON public.audit_log FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())) AND public.can_admin_entreprise(entreprise_id));

CREATE OR REPLACE FUNCTION public.trg_audit_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_prev text; v_old jsonb; v_new jsonb; v_ent uuid; v_id text;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_ent := NULLIF(COALESCE(v_new->>'entreprise_id', v_old->>'entreprise_id'),'')::uuid;
  v_id := COALESCE(v_new->>'id', v_old->>'id');
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
  SELECT hash INTO v_prev FROM public.audit_log ORDER BY id DESC LIMIT 1;
  INSERT INTO public.audit_log (entreprise_id, table_name, operation, row_id, old_data, new_data, user_id, hash_precedent, hash)
  VALUES (v_ent, TG_TABLE_NAME, TG_OP, v_id, v_old, v_new, auth.uid(), v_prev,
    encode(digest(COALESCE(v_prev,'') || TG_TABLE_NAME || TG_OP || COALESCE(v_id,'') || COALESCE(v_old::text,'') || COALESCE(v_new::text,'') || clock_timestamp()::text, 'sha256'), 'hex'));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER audit_ecritures AFTER INSERT OR UPDATE OR DELETE ON public.ecritures FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_plan AFTER INSERT OR UPDATE OR DELETE ON public.plan_comptable FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_exercices AFTER INSERT OR UPDATE OR DELETE ON public.exercices FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_periodes AFTER INSERT OR UPDATE OR DELETE ON public.periodes FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_comptes_systeme AFTER INSERT OR UPDATE OR DELETE ON public.comptes_systeme FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_tva_param AFTER INSERT OR UPDATE OR DELETE ON public.tva_parametrage FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();