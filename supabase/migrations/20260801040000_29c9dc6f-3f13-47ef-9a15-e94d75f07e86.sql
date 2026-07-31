-- Módulo Balanço Patrimonial (BP) e DRE Contábil — Fase 1: cadastro de
-- empresas, upload do "Balancete Contábil Analítico" por empresa/período,
-- De/Para específico (Demonstrativo + Seção + Linha + Ordem de exibição,
-- sem depender de posição de linha) e pendências. As telas de visão de
-- BP/DRE, consolidação e exportação ficam para a próxima entrega.

CREATE TABLE public.bp_dre_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  responsavel_nome text,
  responsavel_documento text,
  rodape_texto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bp_dre_empresas TO authenticated;
GRANT ALL ON public.bp_dre_empresas TO service_role;
ALTER TABLE public.bp_dre_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpdre_emp auth" ON public.bp_dre_empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_bp_dre_empresas_updated_at BEFORE UPDATE ON public.bp_dre_empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bp_dre_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.bp_dre_empresas(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  arquivo text NOT NULL,
  total_linhas int NOT NULL DEFAULT 0,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bpdre_imp_empresa_periodo ON public.bp_dre_importacoes (empresa_id, ano, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bp_dre_importacoes TO authenticated;
GRANT ALL ON public.bp_dre_importacoes TO service_role;
ALTER TABLE public.bp_dre_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpdre_imp auth" ON public.bp_dre_importacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.bp_dre_lancamentos (
  id bigserial PRIMARY KEY,
  importacao_id uuid NOT NULL REFERENCES public.bp_dre_importacoes(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.bp_dre_empresas(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL,
  conta text NOT NULL,
  reduzido text,
  descricao text,
  anterior numeric NOT NULL DEFAULT 0,
  debitos numeric NOT NULL DEFAULT 0,
  creditos numeric NOT NULL DEFAULT 0,
  saldo_atual numeric NOT NULL DEFAULT 0
);
CREATE INDEX idx_bpdre_lanc_periodo ON public.bp_dre_lancamentos (empresa_id, ano, mes);
CREATE INDEX idx_bpdre_lanc_conta ON public.bp_dre_lancamentos (conta);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bp_dre_lancamentos TO authenticated;
GRANT ALL ON public.bp_dre_lancamentos TO service_role;
ALTER TABLE public.bp_dre_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpdre_lanc auth" ON public.bp_dre_lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Demonstrativo+Seção+Linha (não a posição da linha na planilha) é quem
-- desambigua rótulos repetidos entre BP e DRE. Uma conta pode alimentar os
-- dois demonstrativos (UNIQUE por conta+demonstrativo, não só por conta).
CREATE TABLE public.bp_dre_conta_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta text NOT NULL,
  descricao text,
  is_prefixo boolean NOT NULL DEFAULT false,
  demonstrativo text NOT NULL CHECK (demonstrativo IN ('BP', 'DRE')),
  secao text,
  linha text NOT NULL,
  ordem_exibicao int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta, demonstrativo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bp_dre_conta_map TO authenticated;
GRANT ALL ON public.bp_dre_conta_map TO service_role;
ALTER TABLE public.bp_dre_conta_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpdre_map auth" ON public.bp_dre_conta_map FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_bp_dre_conta_map_updated_at BEFORE UPDATE ON public.bp_dre_conta_map
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bp_dre_pendencias(p_empresa_id uuid DEFAULT NULL, p_ano integer DEFAULT NULL, p_mes integer DEFAULT NULL)
 RETURNS TABLE(conta text, descricao text, qtd bigint, valor numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT l.conta, min(l.descricao), count(*), sum(l.saldo_atual)
  FROM public.bp_dre_lancamentos l
  WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
    AND (p_ano IS NULL OR l.ano = p_ano)
    AND (p_mes IS NULL OR l.mes = p_mes)
    AND NOT EXISTS (
      SELECT 1 FROM public.bp_dre_conta_map m
      WHERE (m.is_prefixo AND l.conta LIKE m.conta || '%')
         OR (NOT m.is_prefixo AND m.conta = l.conta)
    )
  GROUP BY l.conta ORDER BY sum(abs(l.saldo_atual)) DESC
$function$;

GRANT EXECUTE ON FUNCTION public.bp_dre_pendencias(uuid, integer, integer) TO authenticated;
