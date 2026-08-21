import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchDespAdmSerie } from "@/lib/desp-adm";

import { AppLayout } from "@/components/AppLayout";
import { ChatBalancete } from "@/components/ChatBalancete";
import { formatBRL, MESES, safraDe, safraLabel } from "@/lib/balancete";
import { exportarAbas } from "@/lib/excel";
import logoGrupo from "@/assets/logo-grupo.png.asset.json";
import {
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analise-despesas-adm")({
  head: () => ({
    meta: [
      { title: "Análise Despesas ADM | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Relatório executivo de Despesas Administrativas (DESP. ADM): número-âncora, leitura executiva, acumulado da safra, evolução, composição da variação e principais contas/rubricas.",
      },
    ],
  }),
  component: AnaliseDespesasAdm,
});

const hoje = new Date();
const CAT_DESP_ADM = "DESP. ADM";
const CAT_RECEITA = "RECEITA BRUTA";
/** Janela buscada: 24 meses permite comparar safra atual vs. safra anterior. */
const MESES_JANELA = 24;
const MESES_HISTORICO = 12;
const LIMITE_ALERTA_PERCENTUAL = 10;
const TOP_PADRAO = 5;
const TOP_EXPANDIDO = 10;

type Linha = {
  ano: number;
  mes: number;
  categoria: string;
  nomecoligada: string;
  nomedepto: string;
  nomecusto: string;
  contacontabil: string;
  valor: number;
};
type Item = { nome: string; valor: number; anterior: number; pct: number; delta: number };

function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}
function mesLabelCurto(ano: number, mes: number) {
  return `${MESES[mes - 1].slice(0, 3)}/${String(ano).slice(2)}`;
}
function periodosAte(anoRef: number, mesRef: number, n: number) {
  const out: { ano: number; mes: number }[] = [];
  let ano = anoRef;
  let mes = mesRef;
  for (let i = 0; i < n; i++) {
    out.unshift({ ano, mes });
    const ant = mesAnterior(ano, mes);
    ano = ant.ano;
    mes = ant.mes;
  }
  return out;
}
/** Meses da safra (abr–mar) do início até o mês de referência. */
function mesesDaSafraAte(ano: number, mes: number) {
  const safra = safraDe(ano, mes);
  const out: { ano: number; mes: number }[] = [];
  let a = safra;
  let m = 4;
  for (let i = 0; i < 12; i++) {
    out.push({ ano: a, mes: m });
    if (a === ano && m === mes) break;
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
  }
  return out;
}
/** "3.4.01.01.0020 - SALARIOS E ORDENADOS" -> "SALARIOS E ORDENADOS" */
function nomeConta(conta: string) {
  const idx = conta.indexOf(" - ");
  const nome = idx >= 0 ? conta.slice(idx + 3).trim() : conta.trim();
  return nome || conta;
}
function formatPct(v: number, sinal = true) {
  return `${sinal && v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function pctTexto(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

type Chave = "nomedepto" | "nomecusto" | "contacontabil" | "nomecoligada";

/** Agrupa o mês atual e o anterior pela mesma chave, com % do total e variação. */
function agruparComparado(atual: Linha[], anterior: Linha[], chave: Chave): Item[] {
  const acumular = (rows: Linha[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r[chave], (m.get(r[chave]) ?? 0) + Number(r.valor));
    return m;
  };
  const mapAtual = acumular(atual);
  const mapAnterior = acumular(anterior);
  const total = [...mapAtual.values()].reduce((a, v) => a + Math.abs(v), 0);
  return [...new Set([...mapAtual.keys(), ...mapAnterior.keys()])]
    .map((nome) => {
      const valor = Math.abs(mapAtual.get(nome) ?? 0);
      const ant = Math.abs(mapAnterior.get(nome) ?? 0);
      return {
        nome,
        valor,
        anterior: ant,
        delta: valor - ant,
        pct: total ? (valor / total) * 100 : 0,
      };
    })
    .filter((i) => i.valor >= 0.005 || Math.abs(i.delta) >= 0.005)
    .sort((a, b) => b.valor - a.valor);
}

function AnaliseDespesasAdm() {
  const [refAno, setRefAno] = useState(hoje.getFullYear());
  const [refMes, setRefMes] = useState(hoje.getMonth() + 1);
  const [deptos, setDeptos] = useState<string[]>([]);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [detalhe, setDetalhe] = useState<{
    titulo: string;
    nomedepto?: string;
    nomecusto?: string;
    contacontabil?: string;
    nomecoligada?: string;
  } | null>(null);

  const serieQ = useQuery({
    queryKey: ["desp_adm_serie", refAno, refMes, "analise"],
    retry: 1,
    queryFn: async () => {
      const data = await fetchDespAdmSerie(refAno, refMes, MESES_JANELA);
      return data as Linha[];
    },
  });

  const detalheQ = useQuery({
    queryKey: ["desp_adm_lancamentos", refAno, refMes, detalhe],
    enabled: !!detalhe,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("desp_adm_lancamentos", {
        p_ano: refAno,
        p_mes: refMes,
        p_nomedepto: detalhe?.nomedepto ?? undefined,
        p_nomecusto: detalhe?.nomecusto ?? undefined,
        p_contacontabil: detalhe?.contacontabil ?? undefined,
        p_nomecoligada: detalhe?.nomecoligada ?? undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Na primeira carga, ancora a referência no mês mais recente com lançamentos.
  const ajustouRef = useRef(false);
  useEffect(() => {
    if (ajustouRef.current || !serieQ.data?.length) return;
    const porMes = new Map<number, number>();
    for (const r of serieQ.data) {
      if (r.categoria !== CAT_DESP_ADM) continue;
      const k = r.ano * 12 + r.mes;
      porMes.set(k, (porMes.get(k) ?? 0) + Number(r.valor));
    }
    console.log('DBG', JSON.stringify([...porMes.entries()].slice(-6)));
    const comValor = [...porMes.entries()].filter(([, v]) => Math.abs(v) >= 0.005);
    if (!comValor.length) return;
    const ultimo = Math.max(...comValor.map(([k]) => k));
    ajustouRef.current = true;
    const ano = Math.floor((ultimo - 1) / 12);
    const mes = ultimo - ano * 12;
    if (ano !== refAno || mes !== refMes) {
      setRefAno(ano);
      setRefMes(mes);
    }
  }, [serieQ.data, refAno, refMes]);

  const opcoesDeptos = useMemo(() => {
    const set = new Set<string>();
    for (const r of serieQ.data ?? []) if (r.categoria === CAT_DESP_ADM) set.add(r.nomedepto);
    return [...set].sort();
  }, [serieQ.data]);

  const mesReferencia = mesLabelCurto(refAno, refMes);

  const analise = useMemo(() => {
    const rows = serieQ.data ?? [];
    const despRows = rows.filter(
      (r) => r.categoria === CAT_DESP_ADM && (!deptos.length || deptos.includes(r.nomedepto)),
    );
    const receitaRows = rows.filter((r) => r.categoria === CAT_RECEITA);

    const somaPeriodo = (linhas: Linha[], ano: number, mes: number) =>
      linhas.filter((r) => r.ano === ano && r.mes === mes).reduce((a, r) => a + Number(r.valor), 0);

    const periodos = periodosAte(refAno, refMes, MESES_HISTORICO);
    const serieValores = periodos.map((p) => Math.abs(somaPeriodo(despRows, p.ano, p.mes)));
    const mediaPeriodo = serieValores.length
      ? serieValores.reduce((a, v) => a + v, 0) / serieValores.length
      : 0;
    const evolucao = periodos.map((p, i) => {
      const janela = serieValores.slice(Math.max(0, i - 2), i + 1);
      const anteriorValor = i > 0 ? serieValores[i - 1] : 0;
      const varMes = anteriorValor ? ((serieValores[i] - anteriorValor) / anteriorValor) * 100 : 0;
      return {
        mes: mesLabelCurto(p.ano, p.mes),
        valor: serieValores[i],
        media3: janela.reduce((a, v) => a + v, 0) / janela.length,
        foraDaFaixa: i > 0 && Math.abs(varMes) > LIMITE_ALERTA_PERCENTUAL,
      };
    });

    const totalMesAtual = Math.abs(somaPeriodo(despRows, refAno, refMes));
    const ant = mesAnterior(refAno, refMes);
    const totalMesAnterior = Math.abs(somaPeriodo(despRows, ant.ano, ant.mes));
    const totalMesmoMesAnoAnterior = Math.abs(somaPeriodo(despRows, refAno - 1, refMes));
    const receitaBrutaMes = Math.abs(somaPeriodo(receitaRows, refAno, refMes));

    const temMesAnterior = totalMesAnterior >= 0.005;
    const temAnoAnterior = totalMesmoMesAnoAnterior >= 0.005;
    const variacaoMoM = temMesAnterior
      ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100
      : 0;
    const variacaoYoY = temAnoAnterior
      ? ((totalMesAtual - totalMesmoMesAnoAnterior) / totalMesmoMesAnoAnterior) * 100
      : 0;
    const pctSobreReceita = receitaBrutaMes !== 0 ? (totalMesAtual / receitaBrutaMes) * 100 : 0;

    // Acumulado da safra (abr–mar) até o mês de referência vs. mesma janela da safra anterior.
    const mesesSafra = mesesDaSafraAte(refAno, refMes);
    const acumSafra = mesesSafra.reduce(
      (a, p) => a + Math.abs(somaPeriodo(despRows, p.ano, p.mes)),
      0,
    );
    const acumSafraAnterior = mesesSafra.reduce(
      (a, p) => a + Math.abs(somaPeriodo(despRows, p.ano - 1, p.mes)),
      0,
    );
    const variacaoSafra = acumSafraAnterior
      ? ((acumSafra - acumSafraAnterior) / acumSafraAnterior) * 100
      : 0;
    const safraAtual = safraDe(refAno, refMes);

    // Ponte: contribuição de cada conta contábil na variação do mês.
    const contasAtual = new Map<string, number>();
    const contasAnterior = new Map<string, number>();
    for (const r of despRows) {
      if (r.ano === refAno && r.mes === refMes)
        contasAtual.set(r.contacontabil, (contasAtual.get(r.contacontabil) ?? 0) + Number(r.valor));
      if (r.ano === ant.ano && r.mes === ant.mes)
        contasAnterior.set(
          r.contacontabil,
          (contasAnterior.get(r.contacontabil) ?? 0) + Number(r.valor),
        );
    }
    const nomesContas = new Set([...contasAtual.keys(), ...contasAnterior.keys()]);
    const TOP_N = 6;
    const deltas = [...nomesContas]
      .map((conta) => ({
        conta,
        nome: nomeConta(conta),
        delta: Math.abs(contasAtual.get(conta) ?? 0) - Math.abs(contasAnterior.get(conta) ?? 0),
      }))
      .filter((d) => Math.abs(d.delta) >= 0.005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const topDeltas = deltas.slice(0, TOP_N);
    const outrosDelta = deltas.slice(TOP_N).reduce((a, d) => a + d.delta, 0);
    const passosDelta = [
      ...topDeltas,
      ...(Math.abs(outrosDelta) >= 0.005
        ? [{ conta: "", nome: "Outras contas", delta: outrosDelta }]
        : []),
    ];

    let acumulado = totalMesAnterior;
    const ponteData: {
      nome: string;
      conta: string;
      base: number;
      valor: number;
      tipo: "total" | "alta" | "queda";
      deltaOriginal?: number;
    }[] = [
      { nome: "Mês anterior", conta: "", base: 0, valor: totalMesAnterior, tipo: "total" },
    ];
    for (const d of passosDelta) {
      const inicio = d.delta >= 0 ? acumulado : acumulado + d.delta;
      ponteData.push({
        nome: d.nome,
        conta: d.conta,
        base: inicio,
        valor: Math.abs(d.delta),
        tipo: d.delta >= 0 ? "alta" : "queda",
        deltaOriginal: d.delta,
      });
      acumulado += d.delta;
    }
    ponteData.push({ nome: "Mês atual", conta: "", base: 0, valor: acumulado, tipo: "total" });

    const altas = topDeltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
    const maiorAlta = altas[0];
    const segundaAlta =
      altas[1] && maiorAlta && altas[1].delta >= maiorAlta.delta * 0.25 ? altas[1] : undefined;
    const maiorQueda = topDeltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];

    const rowsAtual = despRows.filter((r) => r.ano === refAno && r.mes === refMes);
    const rowsAnterior = despRows.filter((r) => r.ano === ant.ano && r.mes === ant.mes);
    const topContas = agruparComparado(rowsAtual, rowsAnterior, "contacontabil");
    const topRubricas = agruparComparado(rowsAtual, rowsAnterior, "nomecusto");
    const topColigadas = agruparComparado(rowsAtual, rowsAnterior, "nomecoligada");

    // Itens não recorrentes: conta com valor no mês atual e sem valor nos 3 meses anteriores.
    const tresAnteriores = periodosAte(ant.ano, ant.mes, 3);
    const historicoContas = new Set(
      despRows
        .filter((r) => tresAnteriores.some((p) => p.ano === r.ano && p.mes === r.mes))
        .filter((r) => Math.abs(Number(r.valor)) >= 0.005)
        .map((r) => r.contacontabil),
    );
    const naoRecorrentes = [...contasAtual.entries()]
      .filter(([conta, valor]) => Math.abs(valor) >= 0.005 && !historicoContas.has(conta))
      .map(([conta, valor]) => ({ conta, nome: nomeConta(conta), valor: Math.abs(valor) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Pontos de atenção: contas cuja variação pesa mais que o limite sobre o total anterior.
    const referenciaAlerta = totalMesAnterior || totalMesAtual;
    const pontosAtencao = deltas
      .filter(
        (d) =>
          referenciaAlerta > 0 &&
          (Math.abs(d.delta) / referenciaAlerta) * 100 >= LIMITE_ALERTA_PERCENTUAL,
      )
      .slice(0, 5)
      .map((d) => ({
        ...d,
        pesoPct: referenciaAlerta ? (d.delta / referenciaAlerta) * 100 : 0,
      }));

    return {
      evolucao,
      mediaPeriodo,
      totalMesAtual,
      totalMesAnterior,
      totalMesmoMesAnoAnterior,
      temMesAnterior,
      temAnoAnterior,
      variacaoMoM,
      variacaoYoY,
      pctSobreReceita,
      acumSafra,
      acumSafraAnterior,
      variacaoSafra,
      safraAtual,
      ponteData,
      maiorAlta,
      segundaAlta,
      maiorQueda,
      topContas,
      topRubricas,
      topColigadas,
      naoRecorrentes,
      pontosAtencao,
    };
  }, [serieQ.data, refAno, refMes, deptos]);

  const leituraExecutiva = useMemo(() => {
    if (analise.totalMesAtual < 0.005) {
      return `Não há despesas administrativas lançadas em ${mesReferencia}. Selecione outro mês de referência ou verifique a importação da base.`;
    }
    let texto = `As despesas administrativas somaram ${formatBRL(analise.totalMesAtual)} em ${mesReferencia}`;
    if (!analise.temMesAnterior) {
      texto += ", sem base comparável no mês anterior";
    } else if (Math.abs(analise.variacaoMoM) < 0.05) {
      texto += ", estáveis em relação ao mês anterior";
    } else {
      const direcao = analise.variacaoMoM > 0 ? "alta" : "queda";
      texto += `, ${direcao} de ${formatPct(Math.abs(analise.variacaoMoM), false)} sobre o mês anterior`;
      if (analise.maiorAlta) {
        texto += `, impulsionada principalmente pela conta ${analise.maiorAlta.nome} (+${formatBRL(analise.maiorAlta.delta)})`;
        if (analise.segundaAlta) {
          texto += ` e ${analise.segundaAlta.nome} (+${formatBRL(analise.segundaAlta.delta)})`;
        }
      }
      if (analise.maiorQueda) {
        texto += ` e parcialmente compensada pela redução em ${analise.maiorQueda.nome} (${formatBRL(analise.maiorQueda.delta)})`;
      }
    }
    texto += ".";
    if (analise.temAnoAnterior) {
      const dirAno = analise.variacaoYoY > 0 ? "acima" : "abaixo";
      texto += ` Frente ao mesmo mês do ano anterior, o gasto está ${dirAno} em ${formatPct(Math.abs(analise.variacaoYoY), false)}.`;
    }
    if (analise.acumSafra >= 0.005) {
      texto += ` No acumulado da safra ${safraLabel(analise.safraAtual)}, o total chega a ${formatBRL(analise.acumSafra)}`;
      if (analise.acumSafraAnterior >= 0.005) {
        const dirSafra = analise.variacaoSafra > 0 ? "alta" : "queda";
        texto += ` (${dirSafra} de ${formatPct(Math.abs(analise.variacaoSafra), false)} sobre a safra anterior)`;
      }
      texto += ".";
    }
    if (analise.naoRecorrentes.length) {
      texto += ` Atenção a itens não recorrentes no mês: ${analise.naoRecorrentes
        .slice(0, 2)
        .map((n) => `${n.nome} (${formatBRL(n.valor)})`)
        .join(" e ")}.`;
    }
    texto += ` No período, essas despesas representaram ${pctTexto(analise.pctSobreReceita)} da receita bruta.`;
    return texto;
  }, [analise, mesReferencia]);

  const alertaAtivo =
    analise.temMesAnterior && Math.abs(analise.variacaoMoM) > LIMITE_ALERTA_PERCENTUAL;
  const mesesOpcoes = useMemo(() => periodosAte(hoje.getFullYear(), hoje.getMonth() + 1, 25), []);
  const carregando = serieQ.isPending;

  function toggleDepto(nome: string) {
    setDeptos((prev) => (prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome]));
  }

  function exportarExcel() {
    const linhaTabela = (i: Item) => ({
      Nome: i.nome,
      "Valor do mês": Number(i.valor.toFixed(2)),
      "Mês anterior": Number(i.anterior.toFixed(2)),
      "Variação (R$)": Number(i.delta.toFixed(2)),
      "% do total": Number(i.pct.toFixed(2)),
    });
    exportarAbas(
      [
        {
          nome: "Resumo",
          rows: [
            { Indicador: "Mês de referência", Valor: mesReferencia },
            { Indicador: "Total do mês", Valor: Number(analise.totalMesAtual.toFixed(2)) },
            { Indicador: "Mês anterior", Valor: Number(analise.totalMesAnterior.toFixed(2)) },
            {
              Indicador: "Mesmo mês, ano anterior",
              Valor: Number(analise.totalMesmoMesAnoAnterior.toFixed(2)),
            },
            {
              Indicador: `Acumulado safra ${safraLabel(analise.safraAtual)}`,
              Valor: Number(analise.acumSafra.toFixed(2)),
            },
            {
              Indicador: "Acumulado safra anterior",
              Valor: Number(analise.acumSafraAnterior.toFixed(2)),
            },
            {
              Indicador: "% sobre a receita bruta",
              Valor: Number(analise.pctSobreReceita.toFixed(2)),
            },
          ],
        },
        {
          nome: "Evolução",
          rows: analise.evolucao.map((e) => ({
            Mês: e.mes,
            Valor: Number(e.valor.toFixed(2)),
            "Média 3M": Number(e.media3.toFixed(2)),
          })),
        },
        { nome: "Contas", rows: analise.topContas.map(linhaTabela) },
        { nome: "Rubricas", rows: analise.topRubricas.map(linhaTabela) },
        { nome: "Empresas", rows: analise.topColigadas.map(linhaTabela) },
      ],
      `analise-desp-adm-${refAno}-${String(refMes).padStart(2, "0")}.xlsx`,
    );
  }

  return (
    <AppLayout
      ocultarCabecalhoImpressao
      titulo="Análise Despesas ADM"
      descricao={`Relatório executivo de DESP. ADM — referência ${mesReferencia}`}
      acoes={
        <>
          <select
            value={`${refAno}-${refMes}`}
            onChange={(e) => {
              const [a, m] = e.target.value.split("-").map(Number);
              setRefAno(a);
              setRefMes(m);
            }}
            className="border border-border bg-transparent px-2 py-1.5 text-sm"
          >
            {mesesOpcoes
              .slice()
              .reverse()
              .map((p) => (
                <option key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>
                  {mesLabelCurto(p.ano, p.mes)}
                </option>
              ))}
          </select>

          <div className="relative">
            <button
              onClick={() => setFiltroAberto((v) => !v)}
              className="flex items-center gap-1.5 border border-border px-2 py-1.5 text-sm"
            >
              <SlidersHorizontal className="size-3.5" />
              Departamento
              {deptos.length > 0 && (
                <span className="text-[11px] text-primary">({deptos.length})</span>
              )}
            </button>
            {filtroAberto && (
              <div className="absolute right-0 z-10 mt-2 max-h-80 w-64 overflow-auto border border-border bg-card p-3 shadow-sm">
                {opcoesDeptos.map((opcao) => (
                  <label
                    key={opcao}
                    className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={deptos.includes(opcao)}
                      onChange={() => toggleDepto(opcao)}
                    />
                    {opcao}
                  </label>
                ))}
                {!opcoesDeptos.length && (
                  <span className="text-xs text-muted-foreground">Nenhum departamento carregado.</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={exportarExcel}
            className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm"
          >
            <FileSpreadsheet className="size-3.5" />
            Excel
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 border border-foreground px-3 py-1.5 text-sm"
          >
            <Download className="size-3.5" />
            Exportar PDF
          </button>
        </>
      }
    >
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div className="mx-auto max-w-5xl px-2 py-2 print:max-w-none">
        {/* CABEÇALHO DE IMPRESSÃO */}
        <div className="mb-6 hidden items-start justify-between gap-6 border-b border-border pb-4 print:flex">
          <div>
            <h2 className="font-serif text-lg">Análise de Despesas Administrativas</h2>
            <p className="text-sm">Consolidado — DESP. ADM (contas 3.4.01.*)</p>
            <p className="mt-1 text-sm font-semibold">Referência: {mesReferencia}</p>
            {!!deptos.length && (
              <p className="mt-1 text-xs">Departamentos: {deptos.join(", ")}</p>
            )}
            <p className="mt-1 text-xs italic text-muted-foreground">(Em Reais)</p>
          </div>
          <img src={logoGrupo.url} alt="Grupo Otávio Lage" className="h-12 object-contain" />
        </div>

        {serieQ.error && (
          <p className="mb-6 text-sm text-destructive">
            Não foi possível carregar os dados —{" "}
            {(serieQ.error as { message?: string }).message ?? String(serieQ.error)}
          </p>
        )}

        {carregando ? (
          <Skeleton />
        ) : (
          <>
            {/* NÚMERO-ÂNCORA + LEITURA EXECUTIVA */}
            <div className="mb-10">
              <div className="flex flex-wrap items-end gap-4">
                <span className="font-serif text-[44px] leading-none">
                  {formatBRL(analise.totalMesAtual)}
                </span>
                <div className="flex items-center gap-3 pb-1.5 text-sm">
                  <span className="text-muted-foreground">vs. mês anterior</span>
                  <Variacao percentual={analise.variacaoMoM} disponivel={analise.temMesAnterior} />
                  <span className="text-border">|</span>
                  <span className="text-muted-foreground">
                    vs. {mesReferencia.split("/")[0]}/ano anterior
                  </span>
                  <Variacao percentual={analise.variacaoYoY} disponivel={analise.temAnoAnterior} />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Total de despesas administrativas — {mesReferencia}
                {alertaAtivo && (
                  <span className="text-destructive">
                    {" "}
                    · variação acima do limite de referência ({LIMITE_ALERTA_PERCENTUAL}%)
                  </span>
                )}
              </p>

              <div className="mt-6 border-l-2 border-primary py-1 pl-5">
                <p className="mb-1.5 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  Leitura executiva
                </p>
                <p className="font-serif text-[15px] leading-relaxed">{leituraExecutiva}</p>
              </div>
            </div>

            {/* INDICADORES */}
            <div className="mb-6 grid grid-cols-2 border-t border-b border-border sm:grid-cols-4">
              {[
                { label: "Mês atual", value: formatBRL(analise.totalMesAtual) },
                { label: "Mês anterior", value: formatBRL(analise.totalMesAnterior) },
                {
                  label: "Mesmo mês, ano anterior",
                  value: formatBRL(analise.totalMesmoMesAnoAnterior),
                },
                {
                  label: "% sobre a receita bruta",
                  value: pctTexto(analise.pctSobreReceita),
                },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className={`px-4 py-4 ${i === 0 ? "" : "border-l border-border"}`}
                >
                  <p className="mb-1 text-[11px] tracking-wider text-muted-foreground uppercase">
                    {item.label}
                  </p>
                  <p className="font-serif text-lg">{item.value}</p>
                </div>
              ))}
            </div>

            {/* ACUMULADO DA SAFRA */}
            <div className="mb-10 grid grid-cols-1 border-b border-border sm:grid-cols-3">
              <div className="px-4 py-4">
                <p className="mb-1 text-[11px] tracking-wider text-muted-foreground uppercase">
                  Acumulado safra {safraLabel(analise.safraAtual)} (abr–{MESES[refMes - 1].slice(0, 3).toLowerCase()})
                </p>
                <p className="font-serif text-lg">{formatBRL(analise.acumSafra)}</p>
              </div>
              <div className="border-t border-border px-4 py-4 sm:border-t-0 sm:border-l">
                <p className="mb-1 text-[11px] tracking-wider text-muted-foreground uppercase">
                  Mesma janela — safra {safraLabel(analise.safraAtual - 1)}
                </p>
                <p className="font-serif text-lg">{formatBRL(analise.acumSafraAnterior)}</p>
              </div>
              <div className="border-t border-border px-4 py-4 sm:border-t-0 sm:border-l">
                <p className="mb-1 text-[11px] tracking-wider text-muted-foreground uppercase">
                  Variação safra vs. safra
                </p>
                <p className="font-serif text-lg">
                  <Variacao
                    percentual={analise.variacaoSafra}
                    disponivel={analise.acumSafraAnterior >= 0.005}
                  />
                </p>
              </div>
            </div>

            {/* EVOLUÇÃO */}
            <div className="mb-10">
              <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Evolução — últimos {MESES_HISTORICO} meses
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                Linha cheia: valor do mês · linha tracejada: média móvel de 3 meses · pontos em
                vermelho: variação acima de {LIMITE_ALERTA_PERCENTUAL}%
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={analise.evolucao}
                  margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip
                    formatter={(v: number, nome: string) => [
                      formatBRL(Number(v)),
                      nome === "media3" ? "Média 3M" : "Valor",
                    ]}
                    contentStyle={{ fontSize: 13, border: "1px solid var(--border)" }}
                  />
                  <ReferenceLine
                    y={analise.mediaPeriodo}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 4"
                    label={{
                      value: "média do período",
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="var(--foreground)"
                    strokeWidth={1.75}
                    dot={(props: {
                      cx?: number;
                      cy?: number;
                      key?: string;
                      payload?: { foraDaFaixa?: boolean };
                    }) => (
                      <circle
                        key={props.key}
                        cx={props.cx}
                        cy={props.cy}
                        r={props.payload?.foraDaFaixa ? 4 : 2.5}
                        fill={
                          props.payload?.foraDaFaixa ? "var(--destructive)" : "var(--foreground)"
                        }
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="media3"
                    stroke="var(--primary)"
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* PONTOS DE ATENÇÃO */}
            {(analise.pontosAtencao.length > 0 || analise.naoRecorrentes.length > 0) && (
              <div className="mb-10">
                <p className="mb-3 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  Pontos de atenção
                </p>
                <ul className="space-y-1.5 text-sm">
                  {analise.pontosAtencao.map((p) => (
                    <li key={`atencao-${p.conta}`} className="flex items-start gap-2">
                      <span
                        className={p.delta > 0 ? "text-destructive" : "text-primary"}
                        aria-hidden
                      >
                        •
                      </span>
                      <button
                        onClick={() =>
                          setDetalhe({ titulo: p.nome, contacontabil: p.conta || undefined })
                        }
                        className="text-left hover:underline"
                      >
                        {p.nome} — {formatBRL(p.delta)} ({formatPct(p.pesoPct)} do total do mês
                        anterior)
                      </button>
                    </li>
                  ))}
                  {analise.naoRecorrentes.map((n) => (
                    <li key={`novo-${n.conta}`} className="flex items-start gap-2">
                      <span className="text-destructive" aria-hidden>
                        •
                      </span>
                      <button
                        onClick={() => setDetalhe({ titulo: n.nome, contacontabil: n.conta })}
                        className="text-left hover:underline"
                      >
                        {n.nome} — {formatBRL(n.valor)} · item não recorrente (sem lançamentos nos 3
                        meses anteriores)
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* PONTE DE VARIAÇÃO */}
            <div className="mb-10">
              <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Composição da variação — {mesReferencia} vs. mês anterior
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                Contribuição de cada conta contábil para a mudança do total
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={analise.ponteData}
                  margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={55}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof analise.ponteData)[number];
                      const valor =
                        p.tipo === "total"
                          ? p.valor
                          : (p.deltaOriginal ?? 0) >= 0
                            ? p.valor
                            : -p.valor;
                      return (
                        <div
                          className="border border-border bg-card px-3 py-2 text-xs shadow-md"
                          style={{ fontSize: 13 }}
                        >
                          <p className="font-medium">{p.nome}</p>
                          <p className="num mt-1">{formatBRL(valor)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
                  <Bar
                    dataKey="valor"
                    stackId="a"
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(d: unknown) => {
                      const payload = (d as { payload: (typeof analise.ponteData)[number] })
                        .payload;
                      if (payload.tipo === "total" || !payload.conta) return;
                      setDetalhe({ titulo: payload.nome, contacontabil: payload.conta });
                    }}
                  >
                    {analise.ponteData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.tipo === "total"
                            ? "var(--foreground)"
                            : entry.tipo === "alta"
                              ? "var(--destructive)"
                              : "var(--primary)"
                        }
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* TABELAS */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-8">
              <TabelaTop
                titulo="Principais despesas — Conta Contábil"
                itens={analise.topContas}
                expandido={!!expandido.contas}
                onExpandir={() => setExpandido((p) => ({ ...p, contas: !p.contas }))}
                onSelecionar={(item) =>
                  setDetalhe({ titulo: nomeConta(item.nome), contacontabil: item.nome })
                }
              />
              <TabelaTop
                titulo="Principais despesas — Rubrica (centro de custo)"
                itens={analise.topRubricas}
                expandido={!!expandido.rubricas}
                onExpandir={() => setExpandido((p) => ({ ...p, rubricas: !p.rubricas }))}
                onSelecionar={(item) => setDetalhe({ titulo: item.nome, nomecusto: item.nome })}
              />
              <TabelaTop
                titulo="Principais despesas — Empresa"
                itens={analise.topColigadas}
                expandido={!!expandido.empresas}
                onExpandir={() => setExpandido((p) => ({ ...p, empresas: !p.empresas }))}
                onSelecionar={(item) => setDetalhe({ titulo: item.nome, nomecoligada: item.nome })}
              />
            </div>
          </>
        )}

        <p className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
          Valores apurados a partir da base contábil e dos ajustes gerenciais do período. Relatório
          de uso interno.
        </p>
      </div>

      <DrilldownModal
        titulo={detalhe?.titulo ?? null}
        carregando={detalheQ.isPending}
        linhas={detalheQ.data ?? []}
        onClose={() => setDetalhe(null)}
      />

      <div className="print:hidden">
      <ChatBalancete
        contexto={`Mês/ano de referência selecionado na tela: ${refMes}/${refAno}.`}
        sugestoes={[
          `Total de DESP. ADM em ${mesReferencia}`,
          "Comparar com o mês anterior",
          "Maiores contas contábeis do mês",
          "Maiores centros de custo do mês",
        ]}
      />
      </div>
    </AppLayout>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true">
      <div className="h-12 w-72 bg-muted" />
      <div className="h-20 w-full bg-muted" />
      <div className="h-24 w-full bg-muted" />
      <div className="h-52 w-full bg-muted" />
      <div className="h-52 w-full bg-muted" />
    </div>
  );
}

function TabelaTop({
  titulo,
  itens,
  expandido,
  onExpandir,
  onSelecionar,
}: {
  titulo: string;
  itens: Item[];
  expandido: boolean;
  onExpandir: () => void;
  onSelecionar: (item: Item) => void;
}) {
  const limite = expandido ? TOP_EXPANDIDO : TOP_PADRAO;
  const visiveis = itens.slice(0, limite);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{titulo}</p>
        {itens.length > TOP_PADRAO && (
          <button
            onClick={onExpandir}
            className="text-xs text-primary hover:underline print:hidden"
          >
            {expandido ? "ver menos" : `ver top ${TOP_EXPANDIDO}`}
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] tracking-wider text-muted-foreground uppercase">
            <th className="pb-1 text-left font-normal">Descrição</th>
            <th className="pb-1 text-right font-normal">Mês</th>
            <th className="pb-1 text-right font-normal">% do total</th>
            <th className="pb-1 text-right font-normal">Mês anterior</th>
            <th className="pb-1 text-right font-normal">Variação</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((item) => {
            const varPct = item.anterior ? (item.delta / item.anterior) * 100 : 0;
            const destaque = item.delta > 0 && item.anterior > 0 && varPct > 25;
            return (
              <tr
                key={item.nome}
                onClick={() => onSelecionar(item)}
                className="cursor-pointer border-t border-border"
              >
                <td className="py-2.5 pr-3">{item.nome}</td>
                <td className="py-2.5 text-right font-serif whitespace-nowrap">
                  {formatBRL(item.valor)}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap text-muted-foreground">
                  {pctTexto(item.pct)}
                </td>
                <td className="py-2.5 text-right font-serif whitespace-nowrap text-muted-foreground">
                  {formatBRL(item.anterior)}
                </td>
                <td
                  className={`py-2.5 text-right whitespace-nowrap ${
                    item.delta > 0 ? "text-destructive" : "text-primary"
                  } ${destaque ? "font-medium" : ""}`}
                >
                  {formatBRL(item.delta)}
                  {item.anterior > 0 && (
                    <span className="ml-1 text-xs">({formatPct(varPct)})</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!visiveis.length && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-muted-foreground">
                Nenhum lançamento neste período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Variacao({ percentual, disponivel = true }: { percentual: number; disponivel?: boolean }) {
  if (!disponivel) return <span className="text-muted-foreground">n/d</span>;
  if (Math.abs(percentual) < 0.05)
    return <span className="font-medium text-muted-foreground">estável</span>;
  const subiu = percentual > 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${subiu ? "text-destructive" : "text-primary"}`}
    >
      <Icone className="size-3.5" strokeWidth={2.25} />
      {formatPct(percentual)}
    </span>
  );
}

function DrilldownModal({
  titulo,
  linhas,
  carregando,
  onClose,
}: {
  titulo: string | null;
  carregando?: boolean;
  linhas: {
    id: number;
    data: string;
    produto: string;
    complemento: string;
    contacontabil: string;
    vlcusto: number;
  }[];
  onClose: () => void;
}) {
  if (!titulo) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl border border-border bg-card p-7 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
              Detalhe de lançamentos
            </p>
            <h3 className="mt-0.5 font-serif text-lg">{titulo}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="max-h-80 overflow-auto border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Data</th>
                <th className="px-2 py-2 text-left font-medium">Produto</th>
                <th className="px-2 py-2 text-left font-medium">Complemento</th>
                <th className="px-2 py-2 text-left font-medium">Conta</th>
                <th className="px-2 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1">{new Date(r.data).toLocaleDateString("pt-BR")}</td>
                  <td className="max-w-40 truncate px-2 py-1">{r.produto}</td>
                  <td className="max-w-40 truncate px-2 py-1">{r.complemento}</td>
                  <td className="px-2 py-1">{r.contacontabil}</td>
                  <td className="px-2 py-1 text-right">{formatBRL(Number(r.vlcusto))}</td>
                </tr>
              ))}
              {!linhas.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                    {carregando ? "Carregando lançamentos…" : "Nenhum lançamento encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={onClose}
          className="mt-5 border border-foreground px-4 py-2 text-sm font-medium"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
