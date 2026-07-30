export const CATEGORIAS = [
  "RECEITA BRUTA",
  "DEVOLUÇÃO",
  "ICMS",
  "PIS",
  "COFINS",
  "INSS RURAL",
  "OUTROS ABATIMENTOS",
  "HEDGE",
  "CPV/CMV",
  "DESP. ADM",
  "DESP. TRIBUT",
  "DESP. VENDAS",
  "OUTRAS RECEITAS OPERACIONAIS",
  "RECEITAS/DESPESAS NÃO OPERAC.",
  "DESPESAS FINANCEIRAS",
  "RECEITAS FINANCEIRAS",
  "IMPOSTO DE RENDA",
  "CONTRIBUIÇÃO SOCIAL",
  "DEPRECIAÇÃO DE BOVINOS",
  "DEPRECIAÇÃO MÁQ/EQUIP/BENS",
  "NÃO CLASSIFICAR / IGNORAR",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export const LINHAS = [
  "BOVINOS / COMPOSTO",
  "GENÉTICA",
  "SEMENTES / GRÃOS",
  "LÁTEX",
  "CANA",
  "OUTROS",
] as const;

export type Linha = (typeof LINHAS)[number];

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const COLUNAS = [
  { key: "receitaBruta", label: "RECEITA\nBRUTA", cat: "RECEITA BRUTA" },
  { key: "devolucao", label: "DEVOLUÇÃO", cat: "DEVOLUÇÃO" },
  { key: "icms", label: "ICMS", cat: "ICMS" },
  { key: "pis", label: "PIS", cat: "PIS" },
  { key: "cofins", label: "COFINS", cat: "COFINS" },
  { key: "inssRural", label: "INSS\nRURAL", cat: "INSS RURAL" },
  { key: "outrosAbat", label: "OUTROS\nABATIMENTOS", cat: "OUTROS ABATIMENTOS" },
  { key: "impostosDevAbat", label: "IMPOSTOS/DEV/\nABAT", cat: null },
  { key: "receitaLiquida", label: "RECEITA\nLÍQUIDA", cat: null },
  { key: "hedge", label: "HEDGE\n(+/-)", cat: "HEDGE" },
  { key: "cpv", label: "CPV /\nCMV", cat: "CPV/CMV" },
  { key: "lucroBruto", label: "LUCRO\nBRUTO", cat: null },
  { key: "despAdm", label: "DESP.\nADM", cat: "DESP. ADM" },
  { key: "despTrib", label: "DESP.\nTRIBUT", cat: "DESP. TRIBUT" },
  { key: "despVendas", label: "DESP.\nVENDAS", cat: "DESP. VENDAS" },
  { key: "saldo", label: "SALDO", cat: null },
] as const;

export type ColKey = (typeof COLUNAS)[number]["key"];
export type Valores = Record<ColKey, number>;

export const RATEADAS: Categoria[] = ["DESP. ADM", "DESP. TRIBUT", "DESP. VENDAS"];

/** Centro de custo cujas despesas administrativas vão 100% para OUTROS. */
export const CCUSTO_ADM_OUTROS = "01.14.0003";
/** Conta + tipo de movimento que também vão 100% para OUTROS. */
export const CONTA_ADM_OUTROS = "3.4.01.10.0003";
export const CODTMV_ADM_OUTROS = "1.2.13";
/** Prefixo das contas de Despesas Administrativas com regra própria. */
export const PREFIXO_ADM = "3.4.01.";

/** Centro de custo das Despesas de Vendas dividido 50/50 (fixo). */
export const CUSTO_VENDAS_FIXO = "FATURAMENTO";
/** Linhas que recebem 50% cada dos lançamentos de FATURAMENTO. */
export const LINHAS_VENDAS_FIXO: Linha[] = ["GENÉTICA", "SEMENTES / GRÃOS"];

export type RegraAdm = "ADM_OUTROS" | "ADM_RATEIO" | "VENDAS_FAT" | "VENDAS_MAP" | "NORMAL";


export interface AggRow {
  safra_ano: number;
  linha: string;
  categoria: string;
  regra?: RegraAdm | string | null;
  valor: number;
  qtd: number;
}

/** Ajuste gerencial manual (+/-) aplicado sobre o valor apurado da base. */
export interface Ajuste {
  id: string;
  categoria: string;
  linha_negocio: string;
  safra_ano: number;
  mes: number;
  valor: number;
  descricao: string;
  user_email?: string | null;
  created_at?: string;
}



const zero = (): Valores =>
  Object.fromEntries(COLUNAS.map((c) => [c.key, 0])) as Valores;

export function formatBRL(v: number): string {
  if (!v || Math.abs(v) < 0.005) return "-";
  const s = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return v < 0 ? `(${s})` : s;
}

export function safraLabel(ano: number) {
  return `${ano}/${ano + 1}`;
}

/** Ano-safra ao qual pertence um mês/ano civil. */
export function safraDe(ano: number, mes: number, inicio = 4) {
  return mes >= inicio ? ano : ano - 1;
}

export interface Bloco {
  rotulo: string;
  saldos: Record<number, number>;
  destaque?: boolean;
  informativo?: boolean;
}

export interface Relatorio {
  safras: number[];
  linhas: { linha: string; valores: Record<number, Valores> }[];
  total: Record<number, Valores>;
  blocos: Bloco[];
  naoMapeado: Record<number, number>;
}

function somaCat(rows: AggRow[], safra: number, cat: string) {
  return rows
    .filter((r) => r.safra_ano === safra && r.categoria === cat)
    .reduce((a, r) => a + Number(r.valor), 0);
}

export function montarRelatorio(
  rows: AggRow[],
  safras: number[],
  rateio: Record<string, number>,
  rateioAdm: Record<string, number> = {},
  rateioTrib: Record<string, number> = {},
  ajustes: Ajuste[] = [],
): Relatorio {
  const totalRateio = LINHAS.reduce((a, l) => a + (rateio[l] || 0), 0);
  const usarRateio = totalRateio > 0;
  const totalAdm = LINHAS.reduce((a, l) => a + (rateioAdm[l] || 0), 0);
  const usarAdm = totalAdm > 0;
  const totalTrib = LINHAS.reduce((a, l) => a + (rateioTrib[l] || 0), 0);
  const usarTrib = totalTrib > 0;

  const soma = (safra: number, cat: string, filtro?: (r: AggRow) => boolean) =>
    rows
      .filter((r) => r.safra_ano === safra && r.categoria === cat && (!filtro || filtro(r)))
      .reduce((a, r) => a + Number(r.valor), 0);

  /** Soma dos ajustes gerenciais manuais de uma categoria (opcionalmente por linha). */
  const somaAjuste = (safra: number, cat: string, linha?: string) =>
    ajustes
      .filter(
        (a) =>
          a.safra_ano === safra && a.categoria === cat && (!linha || a.linha_negocio === linha),
      )
      .reduce((a, r) => a + Number(r.valor), 0);


  const linhas = LINHAS.map((linha) => {
    const valores: Record<number, Valores> = {};
    for (const safra of safras) {
      const v = zero();
      for (const col of COLUNAS) {
        if (!col.cat) continue;
        const daLinha = (r: AggRow) =>
          r.linha === linha || (linha === "OUTROS" && !LINHAS.includes(r.linha as Linha));
        const rateada = RATEADAS.includes(col.cat as Categoria);
        let bruto: number;

        if (col.key === "despAdm") {
          // Contas 3.4.01.* têm regra própria:
          // CODCCUSTO 01.14.0003 → 100% OUTROS; demais → rateio percentual configurado.
          const direto = linha === "OUTROS" ? soma(safra, col.cat, (r) => r.regra === "ADM_OUTROS") : 0;
          const pool = soma(safra, col.cat, (r) => r.regra === "ADM_RATEIO");
          const rateado = usarAdm ? pool * ((rateioAdm[linha] || 0) / totalAdm) : 0;
          const restoPool = soma(safra, col.cat, (r) => r.regra !== "ADM_OUTROS" && r.regra !== "ADM_RATEIO");
          const resto = usarRateio
            ? restoPool * ((rateio[linha] || 0) / totalRateio)
            : soma(
                safra,
                col.cat,
                (r) => r.regra !== "ADM_OUTROS" && r.regra !== "ADM_RATEIO" && daLinha(r),
              );
          bruto = direto + rateado + resto;

        } else if (col.key === "despVendas") {
          // Despesas de vendas: NOMECUSTO "FATURAMENTO" → 50% GENÉTICA + 50% SEMENTES / GRÃOS
          // (fixo); demais → De/Para manual NOMECUSTO → linha de negócio.
          const fatPool = soma(safra, col.cat, (r) => r.regra === "VENDAS_FAT");
          const fat = LINHAS_VENDAS_FIXO.includes(linha as Linha) ? fatPool * 0.5 : 0;
          const mapeado = soma(safra, col.cat, (r) => r.regra !== "VENDAS_FAT" && daLinha(r));
          bruto = fat + mapeado;
        } else if (col.key === "despTrib" && usarTrib) {

          // Despesas tributárias: percentuais configurados com vigência em Configurações.
          bruto = soma(safra, col.cat) * ((rateioTrib[linha] || 0) / totalTrib);
        } else if (rateada && usarRateio) {
          bruto = soma(safra, col.cat) * ((rateio[linha] || 0) / totalRateio);
        } else {
          bruto = soma(safra, col.cat, daLinha);
        }
        v[col.key] = Math.abs(bruto);
        if (col.key === "hedge") v[col.key] = bruto;
      }

      const deducoes =
        v.devolucao + v.icms + v.pis + v.cofins + v.inssRural + v.outrosAbat;
      v.impostosDevAbat = deducoes;
      v.receitaLiquida = v.receitaBruta - deducoes;
      v.lucroBruto = v.receitaLiquida + v.hedge - v.cpv;
      v.saldo = v.lucroBruto - v.despAdm - v.despTrib - v.despVendas;
      valores[safra] = v;
    }
    return { linha, valores };
  });

  const total: Record<number, Valores> = {};
  for (const safra of safras) {
    const t = zero();
    for (const col of COLUNAS) {
      t[col.key] = linhas.reduce((a, l) => a + l.valores[safra][col.key], 0);
    }
    total[safra] = t;
  }

  const s = (cat: string, safra: number, sinal = 1) => sinal * somaCat(rows, safra, cat);
  const perSafra = (fn: (safra: number) => number) =>
    Object.fromEntries(safras.map((x) => [x, fn(x)])) as Record<number, number>;

  const outrasOp = perSafra((x) => s("OUTRAS RECEITAS OPERACIONAIS", x));
  const naoOperac = perSafra((x) => s("RECEITAS/DESPESAS NÃO OPERAC.", x));
  const totalOutras = perSafra((x) => outrasOp[x] + naoOperac[x]);
  const resultadoAntes = perSafra((x) => total[x].saldo + totalOutras[x]);
  const despFin = perSafra((x) => -Math.abs(s("DESPESAS FINANCEIRAS", x)));
  const recFin = perSafra((x) => Math.abs(s("RECEITAS FINANCEIRAS", x)));
  const encargos = perSafra((x) => despFin[x] + recFin[x]);
  const totalFin = perSafra((x) => resultadoAntes[x] + encargos[x]);
  const ir = perSafra((x) => -Math.abs(s("IMPOSTO DE RENDA", x)));
  const csll = perSafra((x) => -Math.abs(s("CONTRIBUIÇÃO SOCIAL", x)));
  const totalImp = perSafra((x) => ir[x] + csll[x]);
  const lucro = perSafra((x) => totalFin[x] + totalImp[x]);
  const depBov = perSafra((x) => s("DEPRECIAÇÃO DE BOVINOS", x));
  const depMaq = perSafra((x) => s("DEPRECIAÇÃO MÁQ/EQUIP/BENS", x));

  const blocos: Bloco[] = [
    { rotulo: "OUTRAS RECEITAS OPERACIONAIS", saldos: outrasOp },
    { rotulo: "RECEITAS / DESPESAS NÃO OPERAC.", saldos: naoOperac },
    { rotulo: "TOTAL OUTRAS RECEITAS", saldos: totalOutras, destaque: true },
    {
      rotulo: "RESULTADO ANTES DAS DESP E REC FINANCEIRAS",
      saldos: resultadoAntes,
      destaque: true,
    },
    { rotulo: "DESPESAS FINANCEIRAS", saldos: despFin },
    { rotulo: "RECEITAS FINANCEIRAS", saldos: recFin },
    { rotulo: "ENCARGOS FINANCEIROS LÍQUIDOS", saldos: encargos, destaque: true },
    { rotulo: "TOTAL", saldos: totalFin, destaque: true },
    { rotulo: "IMPOSTO DE RENDA", saldos: ir },
    { rotulo: "CONTRIBUIÇÃO SOCIAL", saldos: csll },
    { rotulo: "TOTAL IMPOSTOS S/ O LUCRO", saldos: totalImp, destaque: true },
    { rotulo: "LUCRO / PREJUÍZO DO PERÍODO", saldos: lucro, destaque: true },
    { rotulo: "DEPRECIAÇÃO DE BOVINOS", saldos: depBov, informativo: true },
    {
      rotulo: "DEPRECIAÇÃO MÁQ. / EQUIP. / BENS",
      saldos: depMaq,
      informativo: true,
    },
  ];

  const naoMapeado = perSafra((x) =>
    rows
      .filter((r) => r.safra_ano === x && r.categoria === "NÃO MAPEADO")
      .reduce((a, r) => a + Number(r.valor), 0),
  );

  return { safras, linhas, total, blocos, naoMapeado };
}

/** Sugestão automática de linha de negócio a partir do texto. */
export function sugerirLinha(texto: string): Linha | "" {
  const t = (texto || "").toUpperCase();
  if (/SERINGAL|LATEX|LÁTEX|BORRACHA/.test(t)) return "LÁTEX";
  if (/PECUARIA|PECUÁRIA|BOVIN|GADO|CONFINAMENTO/.test(t)) return "BOVINOS / COMPOSTO";
  if (/GENETIC|GENÉTIC|EMBRI|SEMEN/.test(t)) return "GENÉTICA";
  if (/MECANIZADO|GRAOS|GRÃOS|SEMENTE|SOJA|MILHO|SORGO/.test(t)) return "SEMENTES / GRÃOS";
  if (/CANA/.test(t)) return "CANA";
  return "";
}
