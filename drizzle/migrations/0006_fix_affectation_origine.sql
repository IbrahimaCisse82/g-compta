DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_affecter_resultat(uuid,date,numeric,numeric,numeric,numeric)'::regprocedure);
  d := replace(d, '''validee'', ''affectation'')', '''validee'', ''cloture'')');
  EXECUTE d;
END $m$;