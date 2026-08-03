import { supabase } from "@/integrations/supabase/client";

const PAGINA = 1000;

export type DespAdmSerieRow = {
  ano: number;
  mes: number;
  categoria: string;
  nomecoligada: string;
  nomedepto: string;
  nomecusto: string;
  contacontabil: string;
  valor: number;
};

/**
 * Busca a série de despesas administrativas paginando a resposta da API,
 * que por padrão devolve no máximo 1000 linhas por requisição.
 */
export async function fetchDespAdmSerie(
  refAno: number,
  refMes: number,
  meses: number,
): Promise<DespAdmSerieRow[]> {
  const linhas: DespAdmSerieRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .rpc("desp_adm_serie", {
        p_ano_ref: refAno,
        p_mes_ref: refMes,
        p_meses: meses,
      })
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as DespAdmSerieRow[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
    offset += PAGINA;
  }

  return linhas;
}
