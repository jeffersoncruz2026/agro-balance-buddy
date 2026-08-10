import * as XLSX from "xlsx";
import { COLUNAS, MESES, formatBRL, safraLabel, type Relatorio } from "./balancete";

export interface LinhaBase {
  codcoligada: string | null;
  nomecoligada: string | null;
  coddepartamento: string | null;
  codccusto: string | null;
  nomedepto: string | null;
  nomecusto: string | null;
  vlcusto: number;
  complemento: string | null;
  vcodconta: string | null;
  codtmv: string | null;
  contacontabil: string | null;
  produto: string | null;
  documento: string | null;
  nomeconta: string | null;
  data: string;
  grupocontabil: string | null;
  divisao: string | null;
  codfilial: string | null;
  grupocontabil_n9: string | null;
  codund: string | null;
  quantidade: number | null;
  saldounitario: number | null;
  histfaturamento: string | null;
  produto_antigo: string | null;
  nome_orcamento: string | null;
  idpartida: string | null;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const ALIASES: Record<string, string[]> = {
  codcoligada: ["CODCOLIGADA"],
  nomecoligada: ["NOMECOLIGADA", "COLIGADA"],
  coddepartamento: ["CODDEPARTAMENTO"],
  codccusto: ["CODCCUSTO"],
  nomedepto: ["NOMEDEPTO", "NOMEDEPARTAMENTO"],
  nomecusto: ["NOMECUSTO"],
  vlcusto: ["VLCUSTO", "VALOR", "SALDO"],
  complemento: ["COMPLEMENTO"],
  vcodconta: ["VCODCONTA", "CODCONTA", "CONTACONTABIL"],
  codtmv: ["CODTMV"],
  contacontabil: ["CONTACONTABIL"],
  produto: ["PRODUTO", "NOMEPRODUTO"],
  documento: ["DOCUMENTO"],
  nomeconta: ["NOMECONTA", "DESCRICAOCONTABIL"],
  data: ["DATA", "DTLANCAMENTO", "DATACOMPETENCIA"],
  grupocontabil: ["GRUPOCONTABIL"],
  divisao: ["DIVISAO"],
  codfilial: ["CODFILIAL"],
  grupocontabil_n9: ["GRUPOCONTABILN9"],
  codund: ["CODUND", "UNIDADE"],
  quantidade: ["QUANTIDADE"],
  saldounitario: ["SALDOUNITARIO"],
  histfaturamento: ["HISTFATURAMENTO"],
  produto_antigo: ["NOMEPRODUTOANTIGO"],
  nome_orcamento: ["NOMEORCAMENTO"],
  idpartida: ["IDPARTIDA"],
};

const ESSENCIAIS = ["nomecoligada", "vlcusto", "vcodconta", "produto", "data"];


function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function parseBase(buffer: ArrayBuffer): {
  linhas: LinhaBase[];
  ignoradas: number;
  colunasNaoEncontradas: string[];
} {
  const wb = XLSX.read(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  const header = raw.length ? Object.keys(raw[0]) : [];
  const mapa: Record<string, string> = {};
  for (const [campo, alias] of Object.entries(ALIASES)) {
    // respeita a ordem de prioridade dos apelidos (layout antigo antes do novo)
    for (const a of alias) {
      const found = header.find((h) => norm(h) === a);
      if (found) {
        mapa[campo] = found;
        break;
      }
    }
  }

  const faltando = ESSENCIAIS.filter((k) => !(k in mapa));

  const linhas: LinhaBase[] = [];
  let ignoradas = 0;
  for (const r of raw) {
    const data = toDate(mapa.data ? r[mapa.data] : null);
    if (!data) {
      ignoradas++;
      continue;
    }
    const get = (k: string) => {
      const c = mapa[k];
      const v = c ? r[c] : null;
      return v == null || v === "" ? null : String(v).trim();
    };
    const num = (k: string) => (mapa[k] ? toNumber(r[mapa[k]]) : null);

    // COLIGADA pode vir como "18-OL LATEX LTDA" (layout novo)
    let codcoligada = get("codcoligada");
    let nomecoligada = get("nomecoligada");
    if (!codcoligada && nomecoligada) {
      const m = nomecoligada.match(/^(\d+)\s*-\s*(.+)$/);
      if (m) {
        codcoligada = m[1];
        nomecoligada = m[2].trim();
      }
    }

    const vcodconta = get("vcodconta");
    const nomeconta = get("nomeconta");
    let contacontabil = get("contacontabil");
    if (contacontabil && !contacontabil.includes(" - ") && nomeconta) {
      contacontabil = `${contacontabil} - ${nomeconta}`;
    } else if (!contacontabil && vcodconta) {
      contacontabil = nomeconta ? `${vcodconta} - ${nomeconta}` : vcodconta;
    }

    linhas.push({
      codcoligada,
      nomecoligada,
      coddepartamento: get("coddepartamento"),
      codccusto: get("codccusto"),
      nomedepto: get("nomedepto"),
      nomecusto: get("nomecusto"),
      vlcusto: toNumber(mapa.vlcusto ? r[mapa.vlcusto] : 0),
      complemento: get("complemento"),
      vcodconta,
      codtmv: get("codtmv"),
      contacontabil,
      produto: get("produto"),
      documento: get("documento"),
      nomeconta,
      data,
      grupocontabil: get("grupocontabil"),
      divisao: get("divisao"),
      codfilial: get("codfilial"),
      grupocontabil_n9: get("grupocontabil_n9"),
      codund: get("codund"),
      quantidade: num("quantidade"),
      saldounitario: num("saldounitario"),
      histfaturamento: get("histfaturamento"),
      produto_antigo: get("produto_antigo"),
      nome_orcamento: get("nome_orcamento"),
      idpartida: get("idpartida"),
    });
  }
  return { linhas, ignoradas, colunasNaoEncontradas: faltando };

}

const FMT = '#.##0,00;[Red](#.##0,00);"-"';

export function exportarBalancete(rel: Relatorio, periodo: string, arquivo: string) {
  const aoa: (string | number | null)[][] = [];
  aoa.push(["BALANCETE GERENCIAL"]);
  aoa.push([`PERÍODO: ${periodo}`]);
  aoa.push([]);
  aoa.push(["DESCRIÇÃO", "ANO", ...COLUNAS.map((c) => c.label.replace("\n", " "))]);

  const push = (rotulo: string, safra: number, v: Record<string, number>) =>
    aoa.push([rotulo, safraLabel(safra), ...COLUNAS.map((c) => v[c.key] ?? 0)]);

  const safrasDesc = rel.safras.slice().reverse();
  for (const l of rel.linhas) {
    safrasDesc.forEach((s, i) => push(i === 0 ? l.linha : "", s, l.valores[s]));
  }
  safrasDesc.forEach((s, i) => push(i === 0 ? "TOTAL" : "", s, rel.total[s]));
  aoa.push([]);
  for (const b of rel.blocos) {
    safrasDesc.forEach((s, i) => {
      const row: (string | number | null)[] = [i === 0 ? b.rotulo : "", safraLabel(s)];
      for (const c of COLUNAS) row.push(c.key === "saldo" ? b.saldos[s] : null);
      aoa.push(row);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 42 }, { wch: 12 }, ...COLUNAS.map(() => ({ wch: 15 }))];
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 4; R <= range.e.r; R++) {
    for (let C = 2; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === "n") cell.z = FMT;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gerencial");
  XLSX.writeFile(wb, arquivo);
}

export function exportarPlanilha(rows: Record<string, unknown>[], nome: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, nome);
}

export function lerPlanilhaSimples(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}

export { formatBRL };
