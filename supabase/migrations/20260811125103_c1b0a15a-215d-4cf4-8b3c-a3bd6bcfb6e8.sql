CREATE INDEX IF NOT EXISTS idx_produto_map_norm ON public.produto_map (upper(btrim(produto)));
CREATE INDEX IF NOT EXISTS idx_custo_map_norm ON public.custo_map (upper(btrim(nomecusto)));
CREATE INDEX IF NOT EXISTS idx_conta_map_conta ON public.conta_map (conta);

CREATE OR REPLACE FUNCTION public.balancete_periodo(p_meses integer[], p_safra integer)
 RETURNS TABLE(safra_ano integer, linha text, categoria text, regra text, valor numeric, qtd bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  periodos AS (
    SELECT s.safra,
           make_date(CASE WHEN mm >= (SELECT m FROM ini) THEN s.safra ELSE s.safra + 1 END, mm, 1) AS d_ini
    FROM unnest(p_meses) AS mm
    CROSS JOIN (SELECT p_safra AS safra UNION ALL SELECT p_safra - 1) s
  ),
  base AS (
    SELECT l.*, p.safra
    FROM periodos p
    JOIN public.lancamentos l
      ON l.data >= p.d_ini AND l.data < (p.d_ini + INTERVAL '1 month')
  ),
  enr AS (
    SELECT b.*,
      COALESCE(pm.linha_negocio,'NÃO MAPEADO') AS linha_prod,
      COALESCE(am.categoria,'NÃO MAPEADO') AS cat,
      cm.linha_negocio AS linha_custo
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
    LEFT JOIN LATERAL (
      SELECT c.linha_negocio FROM public.custo_map c
      WHERE upper(btrim(c.nomecusto)) = upper(btrim(COALESCE(b.nomecusto,''))) LIMIT 1
    ) cm ON true
  )
  SELECT e.safra,
    CASE WHEN e.cat = 'DESP. VENDAS' AND upper(btrim(COALESCE(e.nomecusto,''))) <> 'FATURAMENTO'
      THEN COALESCE(e.linha_custo,'NÃO MAPEADO') ELSE e.linha_prod END,
    e.cat,
    CASE
      WHEN e.cat = 'DESP. VENDAS' AND upper(btrim(COALESCE(e.nomecusto,''))) = 'FATURAMENTO' THEN 'VENDAS_FAT'
      WHEN e.cat = 'DESP. VENDAS' THEN 'VENDAS_MAP'
      WHEN COALESCE(e.vcodconta,'') LIKE '3.4.01.%'
        THEN CASE
               WHEN upper(btrim(COALESCE(e.nomecusto,''))) = 'GOVERNANCIA CORPORATIVA'
                 OR (btrim(COALESCE(e.vcodconta,'')) = '3.4.01.10.0003'
                     AND upper(btrim(COALESCE(e.produto,''))) <> 'DOACOES CURSOS E FACULDADES FUNCIONARIO')
               THEN 'ADM_OUTROS' ELSE 'ADM_RATEIO' END
      ELSE 'NORMAL'
    END,
    SUM(e.vlcusto), COUNT(*)
  FROM enr e
  GROUP BY 1,2,3,4
$function$;

CREATE OR REPLACE FUNCTION public.balancete_detalhe_periodo(p_meses integer[], p_safra integer, p_safra_linha integer, p_linha text, p_categoria text)
 RETURNS TABLE(id bigint, data date, produto text, complemento text, contacontabil text, vlcusto numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  periodos AS (
    SELECT make_date(CASE WHEN mm >= (SELECT m FROM ini) THEN p_safra_linha ELSE p_safra_linha + 1 END, mm, 1) AS d_ini
    FROM unnest(p_meses) AS mm
  ),
  base AS (
    SELECT l.*
    FROM periodos p
    JOIN public.lancamentos l
      ON l.data >= p.d_ini AND l.data < (p.d_ini + INTERVAL '1 month')
  )
  SELECT b.id, b.data, b.produto, b.complemento, b.contacontabil, b.vlcusto
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
  LEFT JOIN LATERAL (
    SELECT c.linha_negocio FROM public.custo_map c
    WHERE upper(btrim(c.nomecusto)) = upper(btrim(COALESCE(b.nomecusto,''))) LIMIT 1
  ) cm ON true
  WHERE COALESCE(am.categoria,'NÃO MAPEADO') = p_categoria
    AND (
      CASE WHEN COALESCE(am.categoria,'NÃO MAPEADO') = 'DESP. VENDAS'
            AND upper(btrim(COALESCE(b.nomecusto,''))) <> 'FATURAMENTO'
        THEN COALESCE(cm.linha_negocio,'NÃO MAPEADO')
        ELSE COALESCE(pm.linha_negocio,'NÃO MAPEADO') END
    ) = p_linha
  ORDER BY b.data, b.id
  LIMIT 2000
$function$;