-- Site publicado sem login: visitantes (role anon) podem LER os 6 relatórios.
--
-- As funções de relatório passam a SECURITY DEFINER, para que o visitante veja
-- apenas o que elas devolvem, sem acesso às tabelas brutas (lancamentos etc.).
-- Nenhuma permissão de escrita é concedida a anon.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'balancete_periodo',
        'balancete_detalhe_periodo',
        'rateio_adm_vigente',
        'rateio_trib_vigente',
        'resultado_financeiro',
        'resultado_financeiro_detalhe',
        'desp_adm_lancamentos',
        'desp_adm_serie',
        'perf_rentabilidade',
        'perf_lancamentos',
        'bp_dre_periodos',
        'bp_dre_relatorio',
        'bp_dre_lancamentos_detalhe'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public', r.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.assinatura);
  END LOOP;
END $$;

-- Tabelas pequenas lidas diretamente pelas telas: somente leitura.
GRANT SELECT ON public.configuracoes TO anon;
DROP POLICY IF EXISTS "cfg leitura publica" ON public.configuracoes;
CREATE POLICY "cfg leitura publica" ON public.configuracoes FOR SELECT TO anon USING (true);

GRANT SELECT ON public.bp_dre_empresas TO anon;
DROP POLICY IF EXISTS "bpdre_emp leitura publica" ON public.bp_dre_empresas;
CREATE POLICY "bpdre_emp leitura publica" ON public.bp_dre_empresas FOR SELECT TO anon USING (true);

-- Ajustes: leitura sem as colunas de usuário (não expõe e-mails).
GRANT SELECT (id, categoria, linha_negocio, safra_ano, mes, valor, descricao, created_at, updated_at)
  ON public.ajustes TO anon;
DROP POLICY IF EXISTS "ajustes leitura publica" ON public.ajustes;
CREATE POLICY "ajustes leitura publica" ON public.ajustes FOR SELECT TO anon USING (true);