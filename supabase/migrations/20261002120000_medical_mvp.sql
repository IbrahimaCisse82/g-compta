-- ============================================================
-- MODULE MÉDICAL — MVP facturation
-- Patients · Actes · Assureurs (tiers payant) · Facturation · Encaissements
-- Additif uniquement : aucune table/fonction existante n'est modifiée.
-- Conventions reprises des migrations précédentes :
--   RLS par entreprise_id + can_write_entreprise / can_admin_entreprise
--   Trigger touch_updated_at
-- ============================================================

-- ---------- 1. PATIENTS ----------
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  numero_dossier text NOT NULL,
  nom text NOT NULL,
  prenom text,
  date_naissance date,
  sexe text CHECK (sexe IN ('M','F')),
  telephone text,
  email text,
  adresse text,
  ninea text,
  rccm text,
  -- Compte tiers réutilisé : la facturation médicale reste comptabilisable
  -- via le mécanisme client existant (compte_tiers + code).
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  notes text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_dossier ON public.patients(entreprise_id, numero_dossier);
CREATE INDEX IF NOT EXISTS idx_patients_entreprise ON public.patients(entreprise_id);
GRANT SELECT ON public.patients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY patients_sel ON public.patients FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY patients_ins ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY patients_upd ON public.patients FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY patients_del ON public.patients FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY patients_demo_read ON public.patients FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_patients_touch BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 2. ACTES MÉDICAUX (catalogue) ----------
CREATE TABLE IF NOT EXISTS public.actes_medicaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code text NOT NULL,
  libelle text NOT NULL,
  categorie text NOT NULL DEFAULT 'analyse'
    CHECK (categorie IN ('consultation','analyse','acte_infirmier','imagerie')),
  tarif numeric(18,2) NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acte_code ON public.actes_medicaux(entreprise_id, code);
GRANT SELECT ON public.actes_medicaux TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actes_medicaux TO authenticated;
GRANT ALL ON public.actes_medicaux TO service_role;
ALTER TABLE public.actes_medicaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY actes_medicaux_sel ON public.actes_medicaux FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY actes_medicaux_ins ON public.actes_medicaux FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY actes_medicaux_upd ON public.actes_medicaux FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY actes_medicaux_del ON public.actes_medicaux FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY actes_medicaux_demo_read ON public.actes_medicaux FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_actes_medicaux_touch BEFORE UPDATE ON public.actes_medicaux
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 3. ASSUREURS (IPM / mutuelles / assurances) ----------
CREATE TABLE IF NOT EXISTS public.assureurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code text NOT NULL,
  nom text NOT NULL,
  type text NOT NULL DEFAULT 'mutuelle'
    CHECK (type IN ('ipm','mutuelle','assurance','autre')),
  -- Taux de repli appliqué aux actes sans taux spécifique
  taux_defaut numeric(5,2) NOT NULL DEFAULT 0 CHECK (taux_defaut >= 0 AND taux_defaut <= 100),
  telephone text,
  email text,
  adresse text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assureur_code ON public.assureurs(entreprise_id, code);
GRANT SELECT ON public.assureurs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assureurs TO authenticated;
GRANT ALL ON public.assureurs TO service_role;
ALTER TABLE public.assureurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY assureurs_sel ON public.assureurs FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY assureurs_ins ON public.assureurs FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureurs_upd ON public.assureurs FOR UPDATE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id)) WITH CHECK (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureurs_del ON public.assureurs FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureurs_demo_read ON public.assureurs FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_assureurs_touch BEFORE UPDATE ON public.assureurs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 4. TAUX DE COUVERTURE PAR ACTE ----------
CREATE TABLE IF NOT EXISTS public.assureur_taux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  assureur_id uuid NOT NULL REFERENCES public.assureurs(id) ON DELETE CASCADE,
  acte_id uuid NOT NULL REFERENCES public.actes_medicaux(id) ON DELETE CASCADE,
  taux numeric(5,2) NOT NULL DEFAULT 0 CHECK (taux >= 0 AND taux <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assureur_acte ON public.assureur_taux(assureur_id, acte_id);
GRANT SELECT ON public.assureur_taux TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assureur_taux TO authenticated;
GRANT ALL ON public.assureur_taux TO service_role;
ALTER TABLE public.assureur_taux ENABLE ROW LEVEL SECURITY;
CREATE POLICY assureur_taux_sel ON public.assureur_taux FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY assureur_taux_ins ON public.assureur_taux FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureur_taux_upd ON public.assureur_taux FOR UPDATE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id)) WITH CHECK (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureur_taux_del ON public.assureur_taux FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY assureur_taux_demo_read ON public.assureur_taux FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_assureur_taux_touch BEFORE UPDATE ON public.assureur_taux
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 5. ASSURANCES DU PATIENT ----------
CREATE TABLE IF NOT EXISTS public.patient_assurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  assureur_id uuid NOT NULL REFERENCES public.assureurs(id) ON DELETE CASCADE,
  numero_adherent text,
  ordre integer NOT NULL DEFAULT 1,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_assurances_patient ON public.patient_assurances(patient_id);
GRANT SELECT ON public.patient_assurances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_assurances TO authenticated;
GRANT ALL ON public.patient_assurances TO service_role;
ALTER TABLE public.patient_assurances ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_assurances_sel ON public.patient_assurances FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY patient_assurances_ins ON public.patient_assurances FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY patient_assurances_upd ON public.patient_assurances FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY patient_assurances_del ON public.patient_assurances FOR DELETE TO authenticated
  USING (public.can_write_entreprise(entreprise_id));
CREATE POLICY patient_assurances_demo_read ON public.patient_assurances FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- ---------- 6. FACTURES MÉDICALES ----------
CREATE TABLE IF NOT EXISTS public.factures_medicales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  assureur_id uuid REFERENCES public.assureurs(id) ON DELETE SET NULL,
  numero text NOT NULL,
  date_facture date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance date,
  prescripteur text,
  objet text,
  total_ht numeric(18,2) NOT NULL DEFAULT 0,
  total_part_patient numeric(18,2) NOT NULL DEFAULT 0,
  total_part_organisme numeric(18,2) NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'a_encaisser'
    CHECK (statut IN ('brouillon','a_encaisser','partiellement_reglee','reglee','annulee')),
  comptabilisee boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_facture_medicale_numero ON public.factures_medicales(entreprise_id, numero);
CREATE INDEX IF NOT EXISTS idx_factures_medicales_patient ON public.factures_medicales(patient_id);
GRANT SELECT ON public.factures_medicales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures_medicales TO authenticated;
GRANT ALL ON public.factures_medicales TO service_role;
ALTER TABLE public.factures_medicales ENABLE ROW LEVEL SECURITY;
CREATE POLICY factures_medicales_sel ON public.factures_medicales FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY factures_medicales_ins ON public.factures_medicales FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY factures_medicales_upd ON public.factures_medicales FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY factures_medicales_del ON public.factures_medicales FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY factures_medicales_demo_read ON public.factures_medicales FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_factures_medicales_touch BEFORE UPDATE ON public.factures_medicales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 7. LIGNES DE FACTURE MÉDICALE ----------
CREATE TABLE IF NOT EXISTS public.factures_medicales_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.factures_medicales(id) ON DELETE CASCADE,
  acte_id uuid REFERENCES public.actes_medicaux(id) ON DELETE SET NULL,
  designation text NOT NULL,
  quantite numeric(12,2) NOT NULL DEFAULT 1,
  prix_unitaire numeric(18,2) NOT NULL DEFAULT 0,
  remise_pct numeric(5,2) NOT NULL DEFAULT 0,
  montant_ht numeric(18,2) NOT NULL DEFAULT 0,
  taux_couverture numeric(5,2) NOT NULL DEFAULT 0,
  part_organisme numeric(18,2) NOT NULL DEFAULT 0,
  part_patient numeric(18,2) NOT NULL DEFAULT 0,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factures_medicales_lignes_facture ON public.factures_medicales_lignes(facture_id);
GRANT SELECT ON public.factures_medicales_lignes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures_medicales_lignes TO authenticated;
GRANT ALL ON public.factures_medicales_lignes TO service_role;
ALTER TABLE public.factures_medicales_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY factures_medicales_lignes_sel ON public.factures_medicales_lignes FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY factures_medicales_lignes_ins ON public.factures_medicales_lignes FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY factures_medicales_lignes_upd ON public.factures_medicales_lignes FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY factures_medicales_lignes_del ON public.factures_medicales_lignes FOR DELETE TO authenticated
  USING (public.can_write_entreprise(entreprise_id));
CREATE POLICY factures_medicales_lignes_demo_read ON public.factures_medicales_lignes FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- ---------- 8. ENCAISSEMENTS ----------
CREATE TABLE IF NOT EXISTS public.encaissements_medicaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.factures_medicales(id) ON DELETE CASCADE,
  date_reglement date NOT NULL DEFAULT CURRENT_DATE,
  montant numeric(18,2) NOT NULL DEFAULT 0,
  moyen_paiement text NOT NULL DEFAULT 'especes'
    CHECK (moyen_paiement IN ('especes','mobile_money','virement','cheque','organisme')),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encaissements_medicaux_facture ON public.encaissements_medicaux(facture_id);
GRANT SELECT ON public.encaissements_medicaux TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encaissements_medicaux TO authenticated;
GRANT ALL ON public.encaissements_medicaux TO service_role;
ALTER TABLE public.encaissements_medicaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY encaissements_medicaux_sel ON public.encaissements_medicaux FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY encaissements_medicaux_ins ON public.encaissements_medicaux FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY encaissements_medicaux_upd ON public.encaissements_medicaux FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY encaissements_medicaux_del ON public.encaissements_medicaux FOR DELETE TO authenticated
  USING (public.can_admin_entreprise(entreprise_id));
CREATE POLICY encaissements_medicaux_demo_read ON public.encaissements_medicaux FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- ---------- 9. NUMÉROTATION DES DOSSIERS PATIENTS ----------
-- Séquences par entreprise, à l'image de ecriture_sequences.
CREATE TABLE IF NOT EXISTS public.patient_sequences (
  entreprise_id uuid PRIMARY KEY REFERENCES public.entreprises(id) ON DELETE CASCADE,
  dernier_numero integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.patient_sequences TO authenticated;
GRANT ALL ON public.patient_sequences TO service_role;
ALTER TABLE public.patient_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_sequences_sel ON public.patient_sequences FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY patient_sequences_ins ON public.patient_sequences FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY patient_sequences_upd ON public.patient_sequences FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));

CREATE OR REPLACE FUNCTION public.fn_prochain_numero_dossier(_entreprise_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq integer;
BEGIN
  IF NOT public.can_write_entreprise(_entreprise_id) THEN
    RAISE EXCEPTION 'Droits insuffisants pour creer un dossier patient';
  END IF;
  INSERT INTO public.patient_sequences (entreprise_id, dernier_numero)
  VALUES (_entreprise_id, 1)
  ON CONFLICT (entreprise_id)
  DO UPDATE SET dernier_numero = public.patient_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_seq;
  RETURN 'PAT-' || lpad(v_seq::text, 4, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_prochain_numero_dossier(uuid) TO authenticated;
