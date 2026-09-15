-- ══════════════════════════════════════════════════════════
-- CLASSE 9 — ENGAGEMENTS HORS BILAN (SYSCOHADA révisé)
-- ══════════════════════════════════════════════════════════
-- Les engagements (garanties reçues/données, crédits confirmés, cautions)
-- sont tracés à part et N'alimentent JAMAIS le bilan ni le journal :
-- ils figurent uniquement en annexe (note « engagements hors bilan »).
-- Comptes concernés : 90 à 99 (classe 9).

CREATE TABLE IF NOT EXISTS public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid REFERENCES public.exercices(id) ON DELETE SET NULL,
  type_engagement text NOT NULL CHECK (type_engagement IN (
    'garantie_donnee', 'garantie_recue', 'credit_confirme', 'caution', 'autre'
  )),
  compte_engagement text NOT NULL,          -- compte hors bilan 90X-99X
  libelle text NOT NULL,
  tiers text,
  montant numeric(18,2) NOT NULL DEFAULT 0,
  devise text NOT NULL DEFAULT 'FCFA',
  date_debut date,
  date_echeance date,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'extourne')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_entreprise ON public.engagements(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_engagements_exercice ON public.engagements(exercice_id);

ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;

-- Lecture : utilisateurs ayant accès à l'entreprise + démo (anon)
CREATE POLICY "engagements_sel" ON public.engagements
  FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "engagements_anon_sel" ON public.engagements
  FOR SELECT TO anon, authenticated
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- Écriture : admin/comptable uniquement (le lecteur ne peut pas modifier)
CREATE POLICY "engagements_ins" ON public.engagements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY "engagements_upd" ON public.engagements
  FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id))
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY "engagements_del" ON public.engagements
  FOR DELETE TO authenticated
  USING (public.can_write_entreprise(entreprise_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagements TO authenticated, anon;
