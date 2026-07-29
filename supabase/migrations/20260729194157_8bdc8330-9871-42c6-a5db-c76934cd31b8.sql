CREATE TABLE public.rateio_adm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigencia date NOT NULL,
  linha_negocio text NOT NULL,
  percentual numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vigencia, linha_negocio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rateio_adm TO authenticated;
GRANT ALL ON public.rateio_adm TO service_role;

ALTER TABLE public.rateio_adm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radm auth" ON public.rateio_adm FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_rateio_adm_updated_at BEFORE UPDATE ON public.rateio_adm
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.rateio_adm (vigencia, linha_negocio, percentual) VALUES
  ('2000-01-01', 'BOVINOS / COMPOSTO', 30),
  ('2000-01-01', 'GENÉTICA', 15),
  ('2000-01-01', 'SEMENTES / GRÃOS', 25),
  ('2000-01-01', 'LÁTEX', 15),
  ('2000-01-01', 'CANA', 10),
  ('2000-01-01', 'OUTROS', 5);

CREATE OR REPLACE FUNCTION public.rateio_adm_vigente(p_ano integer, p_mes integer)
RETURNS TABLE(linha_negocio text, percentual numeric, vigencia date)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT r.linha_negocio, r.percentual, r.vigencia
  FROM public.rateio_adm r
  WHERE r.vigencia = (
    SELECT max(v.vigencia) FROM public.rateio_adm v
    WHERE v.vigencia <= make_date(p_ano, p_mes, 1)
  )
$function$;

DROP FUNCTION IF EXISTS public.balancete(integer, integer);

CREATE OR REPLACE FUNCTION public.balancete(p_mes integer, p_ano integer)
 RETURNS TABLE(safra_ano integer, linha text, categoria text, regra text, valor numeric, qtd bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  base AS (
    SELECT l.*,
      CASE WHEN EXTRACT(month FROM l.data)::int >= (SELECT m FROM ini)
        THEN EXTRACT(year FROM l.data)::int ELSE EXTRACT(year FROM l.data)::int - 1 END AS safra
    FROM public.lancamentos l
    WHERE EXTRACT(month FROM l.data)::int = p_mes
      AND EXTRACT(year FROM l.data)::int IN (p_ano, p_ano - 1)
  )
  SELECT b.safra,
         COALESCE(pm.linha_negocio, 'NÃO MAPEADO'),
         COALESCE(am.categoria, 'NÃO MAPEADO'),
         CASE
           WHEN COALESCE(b.vcodconta,'') LIKE '3.4.01.%'
             THEN CASE WHEN btrim(COALESCE(b.codccusto,'')) = '01.14.0003'
                       THEN 'ADM_OUTROS' ELSE 'ADM_RATEIO' END
           ELSE 'NORMAL'
         END,
         SUM(b.vlcusto),
         COUNT(*)
  FROM base b
  LEFT JOIN LATERAL (
    SELECT p.linha_negocio FROM public.produto_map p
    WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(b.produto,''))) LIMIT 1
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT a.categoria FROM public.conta_map a
    WHERE (a.is_prefixo AND COALESCE(b.vcodconta,'') LIKE a.conta || '%')
       OR (NOT a.is_prefixo AND a.conta = COALESCE(b.vcodconta,''))
    ORDER BY length(a.conta) DESC LIMIT 1
  ) am ON true
  GROUP BY 1,2,3,4
$function$;
