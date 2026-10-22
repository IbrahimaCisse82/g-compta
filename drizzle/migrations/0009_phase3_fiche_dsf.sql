ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS regime_fiscal text;
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS activite_principale text;
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS effectif integer CHECK (effectif IS NULL OR effectif >= 0);
ALTER TABLE public.exercices ADD COLUMN IF NOT EXISTS date_depot_dsf date;