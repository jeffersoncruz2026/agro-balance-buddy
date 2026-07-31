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
