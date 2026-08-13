CREATE OR REPLACE FUNCTION public.perf_rentabilidade(p_ini date, p_fim date)
 RETURNS TABLE(ano integer, mes integer, tipo text, atividade text, divisao text, nomedepto text, nomecusto text, nomecoligada text, codfilial text, codund text, produto text, valor numeric, quantidade numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT l.*,
      EXTRACT(year FROM l.data)::int AS ano_civil,
      EXTRACT(month FROM l.data)::int AS mes_civil,
      am.categoria AS cat,
      COALESCE(pm.linha_negocio, cm.linha_negocio, 'CLASSIFICAÇÃO PENDENTE') AS ativ
    FROM public.lancamentos l
    LEFT JOIN LATERAL (
      SELECT p.linha_negocio FROM public.produto_map p
      WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(l.produto,''))) LIMIT 1
    ) pm ON true
    LEFT JOIN LATERAL (
      SELECT c.linha_negocio FROM public.custo_map c
      WHERE upper(btrim(c.nomecusto)) = upper(btrim(COALESCE(l.nomecusto,''))) LIMIT 1
    ) cm ON true
    LEFT JOIN LATERAL (
      SELECT a.categoria FROM public.conta_map a
      WHERE (a.is_prefixo AND COALESCE(l.vcodconta,'') LIKE a.conta || '%')
         OR (NOT a.is_prefixo AND a.conta = COALESCE(l.vcodconta,''))
      ORDER BY length(a.conta) DESC LIMIT 1
    ) am ON true
    WHERE l.data >= p_ini AND l.data <= p_fim
  ),
  tip AS (
    SELECT b.*,
      CASE
        WHEN COALESCE(b.vcodconta,'') LIKE '3.1.%' THEN 'RECEITA'
        WHEN COALESCE(b.vcodconta,'') LIKE '3.3.%' THEN 'CPV'
        WHEN b.cat = 'HEDGE' THEN 'HEDGE'
        WHEN b.cat IN ('DEVOLUÇÃO','ICMS','PIS','COFINS','INSS RURAL','OUTROS ABATIMENTOS') THEN 'DEDUCAO'
        ELSE NULL
      END AS t
    FROM base b
  )
  SELECT t.ano_civil, t.mes_civil, t.t, t.ativ,
    COALESCE(NULLIF(btrim(t.divisao),''), 'SEM DIVISÃO'),
    COALESCE(NULLIF(btrim(t.nomedepto),''), 'SEM DEPARTAMENTO'),
    COALESCE(NULLIF(btrim(t.nomecusto),''), 'SEM RUBRICA'),
    COALESCE(NULLIF(btrim(t.nomecoligada),''), 'SEM EMPRESA'),
    COALESCE(NULLIF(btrim(t.codfilial),''), '-'),
    COALESCE(NULLIF(btrim(t.codund),''), 'SEM UN'),
    COALESCE(NULLIF(btrim(t.produto),''), 'SEM PRODUTO'),
    -- Sinal aplicado ao total do grupo (nunca por linha): receita é crédito na base,
    -- por isso invertemos o sinal; CPV, deduções e hedge mantêm o sinal contábil.
    CASE WHEN t.t = 'RECEITA' THEN -SUM(t.vlcusto) ELSE SUM(t.vlcusto) END,
    CASE WHEN t.t = 'RECEITA' THEN SUM(
      CASE WHEN upper(COALESCE(t.histfaturamento,'')) LIKE '%COMPLEMENTO DE VALOR%'
             OR upper(COALESCE(t.histfaturamento,'')) LIKE '%COMPLEMENTO REFERENTE%'
             OR upper(COALESCE(t.histfaturamento,'')) LIKE '%COMPLEMENTO EMITIDO%'
        THEN 0 ELSE COALESCE(t.quantidade,0) END
    ) ELSE 0 END
  FROM tip t
  WHERE t.t IS NOT NULL
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11
$function$;