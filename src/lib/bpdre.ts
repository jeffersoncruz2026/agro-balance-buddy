import * as XLSX from "xlsx";

/** Uma linha do "Balancete Contábil Analítico" (Conta, Reduzido, Descrição, Anterior, Débitos, Créditos, Saldo Atual). */
export interface LancamentoBP {
  conta: string;
  reduzido: string | null;
  descricao: string | null;
  anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
}

export interface BalanceteContabilParse {
  /** Nome da empresa lido da primeira linha do arquivo — precisa de confirmação do usuário. */
  empresaDetectada: string | null;
  cnpj: string | null;
  periodoTexto: string | null;
  /** Ano/mês de competência, extraídos do fim do período do arquivo. */
  ano: number | null;
  mes: number | null;
  linhas: LancamentoBP[];
}

export const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const RE_PERIODO = /(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const RE_DATA_UNICA = /(\d{2})\/(\d{2})\/(\d{4})/;

function toNumeroBP(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const s = String(v)
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * O formato "Balancete Contábil Analítico" traz um cabeçalho de título
 * (nome da empresa, CNPJ, período, emissão) antes da linha de colunas —
 * por isso o parse é feito como matriz (header:1) em vez de sheet_to_json.
 */
export function parseBalanceteContabil(buffer: ArrayBuffer): BalanceteContabilParse {
  const wb = XLSX.read(buffer);
  const nomeAba = wb.SheetNames.find((n) => norm(n).includes("BALANCETE")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][];

  let empresaDetectada: string | null = null;
  let cnpj: string | null = null;
  let periodoTexto: string | null = null;
  let ano: number | null = null;
  let mes: number | null = null;
  let headerRow = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const c0 = String(r[0] ?? "").trim();
    const c1 = String(r[1] ?? "").trim();
    if (norm(c0) === "CONTA" && norm(c1) === "REDUZIDO") {
      headerRow = i;
      break;
    }
    if (c0) {
      if (!cnpj) {
        const m = c0.match(RE_CNPJ);
        if (m) cnpj = m[0];
      }
      if (!periodoTexto) {
        const m = c0.match(RE_PERIODO);
        if (m) {
          periodoTexto = m[0];
          mes = Number(m[5]);
          ano = Number(m[6]);
        } else {
          const unica = c0.match(RE_DATA_UNICA);
          if (unica && /emiss(a|ã)o/i.test(c0) === false) {
            periodoTexto = periodoTexto ?? c0;
          }
        }
      }
      if (empresaDetectada === null && !RE_CNPJ.test(c0) && !RE_DATA_UNICA.test(c0)) {
        empresaDetectada = c0;
      }
    }
  }

  if (headerRow === -1) {
    return { empresaDetectada, cnpj, periodoTexto, ano, mes, linhas: [] };
  }

  const linhas: LancamentoBP[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const conta = r[0];
    if (conta == null || String(conta).trim() === "") continue;
    linhas.push({
      conta: String(conta).trim(),
      reduzido: r[1] != null ? String(r[1]).trim() : null,
      descricao: r[2] != null ? String(r[2]).trim() : null,
      anterior: toNumeroBP(r[3]),
      debitos: toNumeroBP(r[4]),
      creditos: toNumeroBP(r[5]),
      saldo_atual: toNumeroBP(r[6]),
    });
  }

  return { empresaDetectada, cnpj, periodoTexto, ano, mes, linhas };
}

/** Encontra a empresa cadastrada cujo nome ou algum alias bate com o nome detectado no arquivo. */
export function encontrarEmpresa<T extends { nome: string; aliases: string[] | null }>(
  nomeDetectado: string | null,
  empresas: T[],
): T | null {
  if (!nomeDetectado) return null;
  const alvo = norm(nomeDetectado);
  return (
    empresas.find(
      (e) => norm(e.nome) === alvo || (e.aliases ?? []).some((a) => norm(a) === alvo),
    ) ?? null
  );
}

/** Uma linha (Demonstrativo+Seção+Linha) já somada pela RPC bp_dre_relatorio. */
export interface LinhaValor {
  demonstrativo: string;
  secao: string | null;
  linha: string;
  ordem_exibicao: number;
  valor: number;
  valor_ano_anterior: number;
}

interface DreItemDef {
  chave: string;
  rotulo: string;
  tipo: "linha" | "subtotal";
  /** Chaves (linhas ou subtotais já calculados) somadas para este subtotal. */
  formula?: string[];
  destaque?: boolean;
}

/**
 * Sequência oficial da DRE (idêntica às abas BP/DRE do Balancete Contábil e
 * ao PDF de referência do grupo). Os valores nunca são fixos — cada
 * "linha" vem da soma dos lançamentos mapeados no De/Para, e cada
 * "subtotal" é a soma das chaves da sua fórmula, recalculada a cada
 * período.
 */
export const DRE_ESTRUTURA: DreItemDef[] = [
  { chave: "receita_liquida", rotulo: "Receita operacional líquida", tipo: "linha" },
  {
    chave: "variacao_ativo_biologico",
    rotulo: "Variação do valor justo de ativo biológico",
    tipo: "linha",
  },
  { chave: "custo_vendas", rotulo: "(-)Custo das vendas e serviços", tipo: "linha" },
  {
    chave: "lucro_bruto",
    rotulo: "Lucro bruto",
    tipo: "subtotal",
    formula: ["receita_liquida", "variacao_ativo_biologico", "custo_vendas"],
  },
  { chave: "despesas_vendas", rotulo: "Despesas de vendas", tipo: "linha" },
  { chave: "despesas_adm", rotulo: "Despesas administrativas e Gerais", tipo: "linha" },
  { chave: "outras_receitas_operacionais", rotulo: "Outras receitas operacionais", tipo: "linha" },
  {
    chave: "equivalencia_patrimonial_1",
    rotulo: "Resultado de equivalência patrimonial",
    tipo: "linha",
  },
  {
    chave: "resultado_antes_financeiras",
    rotulo: "Resultado antes das receitas (despesas) financeiras líquidas e impostos",
    tipo: "subtotal",
    formula: [
      "lucro_bruto",
      "despesas_vendas",
      "despesas_adm",
      "outras_receitas_operacionais",
      "equivalencia_patrimonial_1",
    ],
  },
  { chave: "despesas_financeiras", rotulo: "Despesas financeiras", tipo: "linha" },
  { chave: "receitas_financeiras", rotulo: "Receitas financeiras", tipo: "linha" },
  { chave: "derivativos_hedge", rotulo: "Operações com derivativos (Hedge)", tipo: "linha" },
  {
    chave: "financeiras_liquidas",
    rotulo: "Financeiras líquidas",
    tipo: "subtotal",
    formula: ["despesas_financeiras", "receitas_financeiras", "derivativos_hedge"],
  },
  {
    chave: "equivalencia_patrimonial_2",
    rotulo: "Resultado da equivalência patrimonial",
    tipo: "linha",
  },
  {
    chave: "reversao_perdas_investimentos",
    rotulo: "Reversão / provisão para perdas em investimentos",
    tipo: "linha",
  },
  {
    chave: "resultado_antes_impostos",
    rotulo: "Resultado antes dos impostos",
    tipo: "subtotal",
    formula: [
      "resultado_antes_financeiras",
      "financeiras_liquidas",
      "equivalencia_patrimonial_2",
      "reversao_perdas_investimentos",
    ],
  },
  {
    chave: "ir_csll_corrente",
    rotulo: "Imposto de renda e contribuição social corrente",
    tipo: "linha",
  },
  {
    chave: "ir_csll_diferido",
    rotulo: "Imposto de renda e contribuição social diferido",
    tipo: "linha",
  },
  {
    chave: "lucro_liquido",
    rotulo: "Lucro líquido do exercício",
    tipo: "subtotal",
    formula: ["resultado_antes_impostos", "ir_csll_corrente", "ir_csll_diferido"],
    destaque: true,
  },
];

/** Só os itens da DRE que aceitam De/Para direto (subtotais são sempre calculados). */
export const DRE_LINHAS_MAPEAVEIS = DRE_ESTRUTURA.filter((d) => d.tipo === "linha");

export interface DreLinhaCalc {
  chave: string;
  rotulo: string;
  tipo: "linha" | "subtotal";
  destaque?: boolean;
  valor: number;
  valorAnoAnterior: number;
  /** Linha simples sem lançamento em nenhum dos dois períodos — pode ser ocultada, como no PDF oficial. */
  semDados: boolean;
}

export function montarDRE(linhas: LinhaValor[]): DreLinhaCalc[] {
  const porLinha = new Map<string, LinhaValor>();
  for (const l of linhas) {
    if (l.demonstrativo !== "DRE") continue;
    porLinha.set(norm(l.linha), l);
  }
  const valores = new Map<string, number>();
  const anteriores = new Map<string, number>();
  const resultado: DreLinhaCalc[] = [];
  for (const def of DRE_ESTRUTURA) {
    let valor = 0;
    let valorAnt = 0;
    let semDados = false;
    if (def.tipo === "linha") {
      const encontrada = porLinha.get(norm(def.rotulo));
      // As contas de resultado são lançadas com sinal de crédito (invertido)
      // no balancete: negativo no balancete = receita, positivo = despesa.
      // A DRE inverte o sinal para exibir receita como positivo e despesa
      // como negativo.
      valor = -(encontrada?.valor ?? 0);
      valorAnt = -(encontrada?.valor_ano_anterior ?? 0);
      semDados = !encontrada && valor === 0 && valorAnt === 0;
    } else {
      for (const chaveRef of def.formula ?? []) {
        valor += valores.get(chaveRef) ?? 0;
        valorAnt += anteriores.get(chaveRef) ?? 0;
      }
    }
    valores.set(def.chave, valor);
    anteriores.set(def.chave, valorAnt);
    resultado.push({
      chave: def.chave,
      rotulo: def.rotulo,
      tipo: def.tipo,
      destaque: def.destaque,
      valor,
      valorAnoAnterior: valorAnt,
      semDados,
    });
  }
  return resultado;
}

/** As 5 seções fixas do BP — cada uma soma dinamicamente as linhas que o De/Para atribuir a ela. */
export const BP_SECOES = [
  {
    chave: "ATIVO_CIRCULANTE",
    rotulo: "Ativo Circulante",
    lado: "ativo" as const,
    subtotalRotulo: "Total do ativo circulante",
  },
  {
    chave: "ATIVO_NAO_CIRCULANTE",
    rotulo: "Ativo Não Circulante",
    lado: "ativo" as const,
    subtotalRotulo: "Total do ativo não circulante",
  },
  {
    chave: "PASSIVO_CIRCULANTE",
    rotulo: "Passivo Circulante",
    lado: "passivo" as const,
    subtotalRotulo: "Total do passivo circulante",
  },
  {
    chave: "PASSIVO_NAO_CIRCULANTE",
    rotulo: "Passivo Não Circulante",
    lado: "passivo" as const,
    subtotalRotulo: "Total do passivo não circulante",
  },
  {
    chave: "PATRIMONIO_LIQUIDO",
    rotulo: "Patrimônio Líquido",
    lado: "passivo" as const,
    subtotalRotulo: "Total do patrimônio líquido",
  },
];

export interface BpSecaoCalc {
  chave: string;
  rotulo: string;
  lado: "ativo" | "passivo";
  linhas: { linha: string; valor: number; valorAnoAnterior: number }[];
  subtotalRotulo: string;
  subtotal: number;
  subtotalAnoAnterior: number;
}

export interface BpCalc {
  secoes: BpSecaoCalc[];
  totalAtivo: number;
  totalAtivoAnoAnterior: number;
  totalPassivo: number;
  totalPassivoAnoAnterior: number;
  /** Ativo == Passivo + PL dentro de uma tolerância de arredondamento. */
  consistente: boolean;
}

export function montarBP(linhas: LinhaValor[]): BpCalc {
  const porSecao = new Map<string, LinhaValor[]>();
  for (const l of linhas) {
    if (l.demonstrativo !== "BP") continue;
    const chave = norm(l.secao ?? "");
    if (!porSecao.has(chave)) porSecao.set(chave, []);
    porSecao.get(chave)!.push(l);
  }

  const secoes: BpSecaoCalc[] = BP_SECOES.map((s) => {
    const itens = (porSecao.get(norm(s.chave)) ?? [])
      .slice()
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      // O Passivo e o PL são lançados com sinal de crédito (invertido) no
      // balancete. Passivo Circulante/Não Circulante são sempre economicamente
      // positivos, então valor absoluto resolve. Já o PL pode ser
      // legitimamente negativo (prejuízos acumulados maiores que o capital) —
      // nesse caso ele vira um saldo devedor e é lançado com sinal positivo,
      // então abs() mostraria um PL negativo como positivo. Por isso o PL usa
      // a inversão de sinal (-valor), que preserva o sinal econômico real nos
      // dois casos, em vez de valor absoluto.
      .map((i) => {
        if (s.chave === "PATRIMONIO_LIQUIDO") {
          return { ...i, valor: -i.valor, valor_ano_anterior: -i.valor_ano_anterior };
        }
        return s.lado === "passivo"
          ? { ...i, valor: Math.abs(i.valor), valor_ano_anterior: Math.abs(i.valor_ano_anterior) }
          : i;
      });
    const subtotal = itens.reduce((acc, i) => acc + i.valor, 0);
    const subtotalAnoAnterior = itens.reduce((acc, i) => acc + i.valor_ano_anterior, 0);
    return {
      chave: s.chave,
      rotulo: s.rotulo,
      lado: s.lado,
      linhas: itens.map((i) => ({
        linha: i.linha,
        valor: i.valor,
        valorAnoAnterior: i.valor_ano_anterior,
      })),
      subtotalRotulo: s.subtotalRotulo,
      subtotal,
      subtotalAnoAnterior,
    };
  });

  const totalAtivo = secoes.filter((s) => s.lado === "ativo").reduce((a, s) => a + s.subtotal, 0);
  const totalAtivoAnoAnterior = secoes
    .filter((s) => s.lado === "ativo")
    .reduce((a, s) => a + s.subtotalAnoAnterior, 0);
  const totalPassivo = secoes
    .filter((s) => s.lado === "passivo")
    .reduce((a, s) => a + s.subtotal, 0);
  const totalPassivoAnoAnterior = secoes
    .filter((s) => s.lado === "passivo")
    .reduce((a, s) => a + s.subtotalAnoAnterior, 0);

  return {
    secoes,
    totalAtivo,
    totalAtivoAnoAnterior,
    totalPassivo,
    totalPassivoAnoAnterior,
    consistente: Math.abs(totalAtivo - totalPassivo) < 1,
  };
}

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / Math.abs(anterior);
}

export interface DeParaBPDRERow {
  conta: string;
  is_prefixo: boolean;
  demonstrativo: string;
  secao: string | null;
  linha: string;
  ordem_exibicao: number;
}

export interface DeParaBPDREErro {
  linha: number;
  motivo: string;
}

export interface DeParaBPDREParse {
  validas: DeParaBPDRERow[];
  erros: DeParaBPDREErro[];
}

const ALIASES_DEPARA: Record<string, string[]> = {
  conta: ["CONTA"],
  is_prefixo: ["PREFIXO", "ISPREFIXO"],
  demonstrativo: ["DEMONSTRATIVO"],
  secao: ["SECAO"],
  linha: ["LINHA"],
  ordem_exibicao: ["ORDEM", "ORDEMEXIBICAO"],
};

const PREFIXO_VERDADEIRO = new Set(["TRUE", "1", "SIM", "S", "V", "VERDADEIRO", "X"]);

/**
 * Interpreta a planilha de De/Para do BP/DRE reconhecendo cabeçalhos com
 * variações de acento/maiúsculas (como o parseBase de excel.ts), e valida
 * cada linha contra as seções fixas do BP e as linhas oficiais da DRE —
 * em vez de descartar silenciosamente uma linha mal preenchida, devolve o
 * motivo exato para o usuário corrigir.
 */
export function parseDeParaBPDRE(rows: Record<string, unknown>[]): DeParaBPDREParse {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const mapa: Record<string, string> = {};
  for (const [campo, alias] of Object.entries(ALIASES_DEPARA)) {
    const found = header.find((h) => alias.includes(norm(h)));
    if (found) mapa[campo] = found;
  }

  const secoesPorChave = new Map(BP_SECOES.map((s) => [norm(s.chave), s.chave]));
  const secoesPorRotulo = new Map(BP_SECOES.map((s) => [norm(s.rotulo), s.chave]));
  const linhasDrePorRotulo = new Map(DRE_LINHAS_MAPEAVEIS.map((d) => [norm(d.rotulo), d.rotulo]));

  const validas: DeParaBPDRERow[] = [];
  const erros: DeParaBPDREErro[] = [];

  rows.forEach((r, i) => {
    const numeroLinha = i + 2; // linha 1 é o cabeçalho
    const get = (campo: string) => {
      const c = mapa[campo];
      const v = c ? r[c] : null;
      return v == null ? "" : String(v).trim();
    };

    const conta = get("conta");
    const demonstrativoRaw = get("demonstrativo");
    const secaoRaw = get("secao");
    const linhaRaw = get("linha");
    if (!conta && !demonstrativoRaw && !secaoRaw && !linhaRaw) return; // linha em branco

    if (!conta) {
      erros.push({ linha: numeroLinha, motivo: "Conta em branco." });
      return;
    }
    const demonstrativo = demonstrativoRaw.toUpperCase();
    if (!["BP", "DRE"].includes(demonstrativo)) {
      erros.push({
        linha: numeroLinha,
        motivo: `Demonstrativo "${demonstrativoRaw || "(vazio)"}" inválido — use BP ou DRE.`,
      });
      return;
    }

    let secao: string | null = null;
    if (demonstrativo === "BP") {
      if (!secaoRaw) {
        erros.push({ linha: numeroLinha, motivo: "Seção em branco (obrigatória para BP)." });
        return;
      }
      secao = secoesPorChave.get(norm(secaoRaw)) ?? secoesPorRotulo.get(norm(secaoRaw)) ?? null;
      if (!secao) {
        erros.push({
          linha: numeroLinha,
          motivo: `Seção "${secaoRaw}" não reconhecida. Use exatamente: ${BP_SECOES.map((s) => s.rotulo).join(", ")}.`,
        });
        return;
      }
    }

    let linha = linhaRaw;
    if (!linha) {
      erros.push({ linha: numeroLinha, motivo: "Linha em branco." });
      return;
    }
    if (demonstrativo === "DRE") {
      const oficial = linhasDrePorRotulo.get(norm(linha));
      if (!oficial) {
        erros.push({
          linha: numeroLinha,
          motivo: `Linha "${linha}" não é uma linha oficial da DRE — copie exatamente da aba "Linhas DRE" do modelo.`,
        });
        return;
      }
      linha = oficial;
    }

    validas.push({
      conta,
      is_prefixo: PREFIXO_VERDADEIRO.has(get("is_prefixo").toUpperCase()),
      demonstrativo,
      secao,
      linha,
      ordem_exibicao: Number(get("ordem_exibicao")) || 0,
    });
  });

  return { validas, erros };
}

/** Gera a planilha-modelo para o usuário preencher o De/Para do BP/DRE, com abas de referência das seções e linhas válidas. */
export function gerarModeloDeParaBPDRE(arquivo = "modelo_depara_bp_dre.xlsx") {
  const aoa: (string | number | boolean)[][] = [
    ["Conta", "Prefixo", "Demonstrativo", "Seção", "Linha", "Ordem"],
    ["1.1.01", true, "BP", "Ativo Circulante", "Caixa e equivalentes", 1],
    ["2.1.01", true, "BP", "Passivo Circulante", "Fornecedores e outras contas a pagar", 1],
    ["3.1", true, "DRE", "", "Receita operacional líquida", 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 42 }, { wch: 8 }];

  const wsSecoes = XLSX.utils.aoa_to_sheet([
    ["Seções válidas para contas do BP — copie exatamente como está aqui"],
    ...BP_SECOES.map((s) => [s.rotulo]),
  ]);
  wsSecoes["!cols"] = [{ wch: 40 }];

  const wsLinhasDre = XLSX.utils.aoa_to_sheet([
    ["Linhas válidas para contas da DRE — copie exatamente como está aqui"],
    ...DRE_LINHAS_MAPEAVEIS.map((d) => [d.rotulo]),
  ]);
  wsLinhasDre["!cols"] = [{ wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.utils.book_append_sheet(wb, wsSecoes, "Seções BP");
  XLSX.utils.book_append_sheet(wb, wsLinhasDre, "Linhas DRE");
  XLSX.writeFile(wb, arquivo);
}
