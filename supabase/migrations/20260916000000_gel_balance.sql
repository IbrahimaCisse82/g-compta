-- ══════════════════════════════════════════════════════════
-- A7 — GEL DE LA TABLE balance (la balance est dérivée du journal)
-- ══════════════════════════════════════════════════════════
-- mv_balance (vue matérialisée) est la source de vérité : elle dérive du
-- journal (lignes historiques, ecriture_id IS NULL) et des ecriture_lignes
-- validées. La table `balance` n'est plus écrite par le navigateur : on
-- révoque l'écriture directe (INSERT/UPDATE/DELETE) pour authenticated et anon,
-- comme déjà fait pour ecriture_lignes. Les fonctions SECURITY DEFINER
-- (fn_resync_balance, fn_creer_ecriture) restent capables d'écrire (elles
-- tournent sous le propriétaire de la fonction, non affecté par REVOKE).

REVOKE INSERT, UPDATE, DELETE ON public.balance FROM authenticated, anon;

-- Permet au client de rafraîchir mv_balance après une suppression de ligne
-- historique (la vue matérialisée n'est pas auto-maintenue).
GRANT EXECUTE ON FUNCTION public.fn_refresh_balance() TO authenticated;
