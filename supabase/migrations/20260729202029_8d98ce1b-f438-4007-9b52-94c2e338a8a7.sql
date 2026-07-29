CREATE TABLE public.rateio_trib (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigencia date NOT NULL,
  linha_negocio text NOT NULL,
  percentual numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vigencia, linha_negocio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rateio_trib TO authenticated;
GRANT ALL ON public.rateio_trib TO service_role;

ALTER TABLE public.rateio_trib ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rtrib auth" ON public.rateio_trib FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_rateio_trib_updated_at
BEFORE UPDATE ON public.rateio_trib
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.rateio_trib_vigente(p_ano integer, p_mes integer)
RETURNS TABLE(linha_negocio text, percentual numeric, vigencia date)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT r.linha_negocio, r.percentual, r.vigencia
  FROM public.rateio_trib r
  WHERE r.vigencia = (
    SELECT max(v.vigencia) FROM public.rateio_trib v
    WHERE v.vigencia <= make_date(p_ano, p_mes, 1)
  )
$function$;