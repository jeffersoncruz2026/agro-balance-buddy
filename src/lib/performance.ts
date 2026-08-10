import { supabase } from "@/integrations/supabase/client";

const PAGINA = 1000;

/** Linha agregada devolvida pela função perf_rentabilidade. */
export type PerfRow = {
  ano: number;
  mes: number;
  tipo: "RECEITA" | "CPV" | "DEDUCAO" | "HEDGE";
  atividade: string;
  divisao: string;
  nomedepto: string;
  nomecusto: string;
  nomecoligada: string;
  codfilial: string;
  codund: string;
  produto: string;
  valor: number;
  quantidade: number;
};

export type PerfLancamento = {
  id: number;
  data: string;
  nomecoligada: string;
  codfilial: string;
  documento: string | null;
  divisao: string;
  nomedepto: string;
  nomecusto: string;
  vcodconta: string | null;
  contacontabil: string | null;
  produto: string;
  codund: string;
  quantidade: number | null;
  saldounitario: number | null;
  vlcusto: number;
  histfaturamento: string | null;
  idpartida: string | null;
};

export const ATIVIDADE_PENDENTE = "CLASSIFICAÇÃO PENDENTE";

/** Busca a base agregada paginando a resposta da API (máx. 1000 linhas por request). */
export async function fetchPerfRentabilidade(ini: string, fim: string): Promise<PerfRow[]> {
  const linhas: PerfRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .rpc("perf_rentabilidade", { p_ini: ini, p_fim: fim })
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as PerfRow[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
    offset += PAGINA;
  }
  return linhas;
}

export async function fetchPerfLancamentos(params: {
  ini: string;
  fim: string;
  tipo: "RECEITA" | "CPV";
  atividade?: string | null;
  divisao?: string | null;
  nomedepto?: string | null;
  nomecusto?: string | null;
}): Promise<PerfLancamento[]> {
  const { data, error } = await supabase.rpc("perf_lancamentos", {
    p_ini: params.ini,
    p_fim: params.fim,
    p_tipo: params.tipo,
    p_atividade: params.atividade ?? null,
    p_divisao: params.divisao ?? null,
    p_nomedepto: params.nomedepto ?? null,
    p_nomecusto: params.nomecusto ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PerfLancamento[];
}

/** Indicadores calculados de um recorte (período + filtros + agrupamento). */
export type Metricas = {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  cpv: number;
  hedge: number;
  margem: number;
  margemPct: number;
  cpvSobreReceita: number;
  /** Quantidade por unidade de medida (nunca somamos unidades diferentes). */
  quantidadePorUnidade: Record<string, number>;
  /** Quantidade total — só existe quando há uma única unidade de medida no recorte. */
  quantidade: number | null;
  unidade: string | null;
  precoMedio: number | null;
  cpvUnitario: number | null;
  margemUnitaria: number | null;
};

export function agregar(rows: PerfRow[]): Metricas {
  let receitaBruta = 0;
  let deducoes = 0;
  let cpv = 0;
  let hedge = 0;
  const qtd: Record<string, number> = {};

  for (const r of rows) {
    const v = Number(r.valor) || 0;
    if (r.tipo === "RECEITA") {
      receitaBruta += v;
      const q = Number(r.quantidade) || 0;
      if (q !== 0) qtd[r.codund] = (qtd[r.codund] ?? 0) + q;
    } else if (r.tipo === "CPV") cpv += v;
    else if (r.tipo === "DEDUCAO") deducoes += v;
    else if (r.tipo === "HEDGE") hedge += v;
  }

  const receitaLiquida = receitaBruta - deducoes;
  const margem = receitaLiquida - cpv;
  const unidades = Object.keys(qtd);
  const quantidade = unidades.length === 1 ? qtd[unidades[0]] : null;
  const unidade = unidades.length === 1 ? unidades[0] : null;
  const podeUnit = quantidade !== null && quantidade !== 0;

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    cpv,
    hedge,
    margem,
    margemPct: receitaLiquida !== 0 ? (margem / receitaLiquida) * 100 : 0,
    cpvSobreReceita: receitaLiquida !== 0 ? (cpv / receitaLiquida) * 100 : 0,
    quantidadePorUnidade: qtd,
    quantidade,
    unidade,
    precoMedio: podeUnit ? receitaLiquida / (quantidade as number) : null,
    cpvUnitario: podeUnit ? cpv / (quantidade as number) : null,
    margemUnitaria: podeUnit ? margem / (quantidade as number) : null,
  };
}

export function agruparPor<K extends keyof PerfRow>(rows: PerfRow[], campo: K): Map<string, PerfRow[]> {
  const mapa = new Map<string, PerfRow[]>();
  for (const r of rows) {
    const chave = String(r[campo]);
    const lista = mapa.get(chave);
    if (lista) lista.push(r);
    else mapa.set(chave, [r]);
  }
  return mapa;
}

/** Variação percentual entre dois valores; null quando a base é zero. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function formatCompacto(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sinal}R$ ${(abs / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNum(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatPct(v: number | null, casas = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function formatPP(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
}

export function formatVar(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Meses do ano-safra, de abril a março. */
export const MESES_SAFRA = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

/** Data (YYYY-MM-DD) do primeiro dia do mês dentro da safra informada. */
export function inicioMesSafra(safra: number, mes: number): string {
  const ano = mes >= 4 ? safra : safra + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

/** Último dia do mês dentro da safra informada. */
export function fimMesSafra(safra: number, mes: number): string {
  const ano = mes >= 4 ? safra : safra + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/** Verifica se (ano, mês) civis pertencem ao intervalo de meses-safra selecionado. */
export function dentroDoRecorte(
  ano: number,
  mes: number,
  safra: number,
  mesIni: number,
  mesFim: number,
): boolean {
  const safraDaLinha = mes >= 4 ? ano : ano - 1;
  if (safraDaLinha !== safra) return false;
  const ordem = MESES_SAFRA.indexOf(mes);
  return ordem >= MESES_SAFRA.indexOf(mesIni) && ordem <= MESES_SAFRA.indexOf(mesFim);
}
