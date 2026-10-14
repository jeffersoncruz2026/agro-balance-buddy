import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchDespAdmSerie } from "@/lib/desp-adm";

import { AppLayout } from "@/components/AppLayout";
import { ChatBalancete } from "@/components/ChatBalancete";
import { useLogado } from "@/hooks/useSessao";
import { formatBRL, MESES, safraDe, safraLabel } from "@/lib/balancete";
import { exportarAbas } from "@/lib/excel";
import logoGrupo from "@/assets/logo-grupo.png.asset.json";
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CalendarClock,
  Download,
  FileSpreadsheet,
  History,
  Layers,
  Percent,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  BarChart,
  Line,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Sparkline } from "@/components/Sparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const { data: logado } = useLogado();
  const [refAno, setRefAno] = useState(hoje.getFullYear());
  const [refMes, setRefMes] = useState(hoje.getMonth() + 1);
  const [deptos, setDeptos] = useState<string[]>([]);
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
    }[] = [{ nome: "Mês anterior", conta: "", base: 0, valor: totalMesAnterior, tipo: "total" }];
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

  const totalMes = analise.totalMesAtual;
  const deltaMesAnterior = totalMes - analise.totalMesAnterior;
  const deltaAnoAnterior = totalMes - analise.totalMesmoMesAnoAnterior;
  const maxAcum = Math.max(analise.acumSafra, analise.acumSafraAnterior, 1);

  return (
    <AppLayout
      ocultarCabecalhoImpressao
      titulo="Análise Despesas ADM"
      descricao={`Relatório executivo de DESP. ADM — referência ${mesReferencia}`}
      acoes={
        <>
          <Select
            value={`${refAno}-${refMes}`}
            onValueChange={(v) => {
              const [a, m] = v.split("-").map(Number);
              setRefAno(a);
              setRefMes(m);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mesesOpcoes
                .slice()
                .reverse()
                .map((p) => (
                  <SelectItem key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>
                    {mesLabelCurto(p.ano, p.mes)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal className="size-4" />
                Departamento
                {deptos.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                    {deptos.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))] p-2">
              <div className="max-h-72 overflow-y-auto">
                {opcoesDeptos.map((opcao) => (
                  <label
                    key={opcao}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={deptos.includes(opcao)}
                      onCheckedChange={() => toggleDepto(opcao)}
                    />
                    {opcao}
                  </label>
                ))}
                {!opcoesDeptos.length && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum departamento carregado.
                  </p>
                )}
              </div>
              {deptos.length > 0 && (
                <div className="mt-1 border-t border-border pt-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDeptos([])}>
                    Limpar
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button variant="outline" onClick={exportarExcel}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button onClick={() => window.print()}>
            <Download className="size-4" /> Exportar PDF
          </Button>
        </>
      }
    >
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div className="space-y-6 print:space-y-5">
        {/* CABEÇALHO DE IMPRESSÃO */}
        <div className="hidden items-start justify-between gap-6 border-b border-border pb-4 print:flex">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Análise de Despesas Administrativas
            </h2>
            <p className="text-sm">Consolidado — DESP. ADM (contas 3.4.01.*)</p>
            <p className="mt-1 text-sm font-semibold">Referência: {mesReferencia}</p>
            {!!deptos.length && <p className="mt-1 text-xs">Departamentos: {deptos.join(", ")}</p>}
            <p className="mt-1 text-xs text-muted-foreground italic">(Em Reais)</p>
          </div>
          <img src={logoGrupo.url} alt="Grupo Otávio Lage" className="h-12 object-contain" />
        </div>

        {serieQ.error && (
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados —{" "}
            {(serieQ.error as { message?: string }).message ?? String(serieQ.error)}
          </p>
        )}

        {carregando ? (
          <Skeleton />
        ) : (
          <>
            {/* HERO: número-âncora + leitura executiva */}
            <Card className="overflow-hidden print:border-0 print:shadow-none">
              <div className="grid lg:grid-cols-5">
                <div className="p-5 sm:p-6 lg:col-span-2 lg:border-r lg:border-border print:p-0">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Total de despesas administrativas — {mesReferencia}
                  </p>
                  <p className="mt-2 font-display text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-[44px]">
                    {formatBRL(totalMes)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <ChipVariacao
                      rotulo="vs. mês anterior"
                      percentual={analise.variacaoMoM}
                      disponivel={analise.temMesAnterior}
                    />
                    <ChipVariacao
                      rotulo={`vs. ${mesReferencia.split("/")[0]}/ano anterior`}
                      percentual={analise.variacaoYoY}
                      disponivel={analise.temAnoAnterior}
                    />
                  </div>
                  {alertaAtivo && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3.5" />
                      Variação acima do limite de referência ({LIMITE_ALERTA_PERCENTUAL}%)
                    </p>
                  )}
                  <div className="mt-5">
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      Últimos {MESES_HISTORICO} meses
                    </p>
                    <Sparkline
                      data={analise.evolucao.map((e) => e.valor)}
                      color={analise.variacaoMoM > 0 ? "var(--destructive)" : "var(--primary)"}
                    />
                  </div>
                </div>
                <div className="bg-primary/[0.04] p-5 sm:p-6 lg:col-span-3 print:bg-transparent print:p-0 print:pt-4">
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
                    <Sparkles className="size-3.5" /> Leitura executiva
                  </p>
                  <p className="border-l-2 border-primary pl-4 text-[15px] leading-[1.75] text-foreground/90">
                    {leituraExecutiva}
                  </p>
                </div>
              </div>
            </Card>

            {/* INDICADORES */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CardIndicador
                icone={CalendarClock}
                rotulo="Mês anterior"
                valor={formatBRL(analise.totalMesAnterior)}
              >
                {analise.temMesAnterior ? (
                  <LinhaDelta delta={deltaMesAnterior} percentual={analise.variacaoMoM} />
                ) : (
                  <span className="text-muted-foreground">sem base comparável</span>
                )}
              </CardIndicador>
              <CardIndicador
                icone={History}
                rotulo="Mesmo mês, ano anterior"
                valor={formatBRL(analise.totalMesmoMesAnoAnterior)}
              >
                {analise.temAnoAnterior ? (
                  <LinhaDelta delta={deltaAnoAnterior} percentual={analise.variacaoYoY} />
                ) : (
                  <span className="text-muted-foreground">sem base comparável</span>
                )}
              </CardIndicador>
              <CardIndicador
                icone={Layers}
                rotulo={`Acumulado safra ${safraLabel(analise.safraAtual)} (abr–${MESES[refMes - 1].slice(0, 3).toLowerCase()})`}
                valor={formatBRL(analise.acumSafra)}
              >
                <div className="space-y-1">
                  <BarraComparativa
                    rotulo="Atual"
                    valor={analise.acumSafra}
                    max={maxAcum}
                    cor="bg-primary"
                  />
                  <BarraComparativa
                    rotulo={`Safra ${safraLabel(analise.safraAtual - 1)}`}
                    valor={analise.acumSafraAnterior}
                    max={maxAcum}
                    cor="bg-muted-foreground/40"
                  />
                  <div className="pt-0.5">
                    <Variacao
                      percentual={analise.variacaoSafra}
                      disponivel={analise.acumSafraAnterior >= 0.005}
                    />{" "}
                    <span className="text-muted-foreground">vs. mesma janela</span>
                  </div>
                </div>
              </CardIndicador>
              <CardIndicador
                icone={Percent}
                rotulo="% sobre a receita bruta"
                valor={pctTexto(analise.pctSobreReceita)}
              >
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sidebar-primary"
                    style={{ width: `${Math.min(100, analise.pctSobreReceita * 5)}%` }}
                  />
                </div>
                <p className="mt-1 text-muted-foreground">
                  Despesas ADM do mês ÷ receita bruta do mês
                </p>
              </CardIndicador>
            </div>

            {/* GRÁFICOS */}
            <div className="grid gap-6 xl:grid-cols-2 print:grid-cols-1">
              <Secao
                titulo={`Evolução — últimos ${MESES_HISTORICO} meses`}
                subtitulo={`Área: valor do mês · tracejado laranja: média móvel 3M · pontos vermelhos: variação acima de ${LIMITE_ALERTA_PERCENTUAL}%`}
              >
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart
                    data={analise.evolucao}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradEvolucao" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#gradEvolucao)"
                      isAnimationActive={false}
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
                          r={props.payload?.foraDaFaixa ? 4.5 : 2.5}
                          fill={
                            props.payload?.foraDaFaixa ? "var(--destructive)" : "var(--primary)"
                          }
                          stroke="var(--card)"
                          strokeWidth={1}
                        />
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="media3"
                      stroke="var(--sidebar-primary)"
                      strokeWidth={1.75}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Secao>

              <Secao
                titulo={`Composição da variação — ${mesReferencia} vs. mês anterior`}
                subtitulo="Contribuição de cada conta contábil · vermelho: alta · verde: queda · clique para ver os lançamentos"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart
                    data={analise.ponteData}
                    margin={{ top: 18, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={60}
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
                          <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
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
                      radius={[3, 3, 0, 0]}
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
                              ? "var(--chart-1)"
                              : entry.tipo === "alta"
                                ? "var(--destructive)"
                                : "var(--chart-3)"
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="valor"
                        position="top"
                        fontSize={10}
                        fill="var(--muted-foreground)"
                        formatter={(v: number) =>
                          (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k"
                        }
                      />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </Secao>
            </div>

            {/* PONTOS DE ATENÇÃO */}
            {(analise.pontosAtencao.length > 0 || analise.naoRecorrentes.length > 0) && (
              <Secao titulo="Pontos de atenção" subtitulo="Clique para ver os lançamentos">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {analise.pontosAtencao.map((p) => (
                    <CartaoAtencao
                      key={`atencao-${p.conta}`}
                      tipo={p.delta > 0 ? "alta" : "queda"}
                      nome={p.nome}
                      valor={formatBRL(p.delta)}
                      detalhe={`${formatPct(p.pesoPct)} do total do mês anterior`}
                      onClick={() =>
                        setDetalhe({ titulo: p.nome, contacontabil: p.conta || undefined })
                      }
                    />
                  ))}
                  {analise.naoRecorrentes.map((n) => (
                    <CartaoAtencao
                      key={`novo-${n.conta}`}
                      tipo="novo"
                      nome={n.nome}
                      valor={formatBRL(n.valor)}
                      detalhe="Sem lançamentos nos 3 meses anteriores"
                      onClick={() => setDetalhe({ titulo: n.nome, contacontabil: n.conta })}
                    />
                  ))}
                </div>
              </Secao>
            )}

            {/* PRINCIPAIS DESPESAS */}
            <div className="grid gap-6 xl:grid-cols-3 print:grid-cols-1">
              <Card className="min-w-0 xl:col-span-2 print:border-0 print:shadow-none">
                <Tabs defaultValue="contas" className="p-5 sm:p-6 print:p-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        Principais despesas — {mesReferencia}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Clique numa linha para ver os lançamentos
                      </p>
                    </div>
                    <TabsList className="print:hidden">
                      <TabsTrigger value="contas">Conta contábil</TabsTrigger>
                      <TabsTrigger value="rubricas">Rubrica</TabsTrigger>
                      <TabsTrigger value="empresas">Empresa</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent
                    value="contas"
                    className="data-[state=inactive]:hidden print:data-[state=inactive]:block"
                    forceMount
                  >
                    <TabelaTop
                      titulo="Conta contábil"
                      itens={analise.topContas}
                      expandido={!!expandido.contas}
                      onExpandir={() => setExpandido((p) => ({ ...p, contas: !p.contas }))}
                      onSelecionar={(item) =>
                        setDetalhe({ titulo: nomeConta(item.nome), contacontabil: item.nome })
                      }
                    />
                  </TabsContent>
                  <TabsContent
                    value="rubricas"
                    className="data-[state=inactive]:hidden print:data-[state=inactive]:block"
                    forceMount
                  >
                    <TabelaTop
                      titulo="Rubrica (centro de custo)"
                      itens={analise.topRubricas}
                      expandido={!!expandido.rubricas}
                      onExpandir={() => setExpandido((p) => ({ ...p, rubricas: !p.rubricas }))}
                      onSelecionar={(item) =>
                        setDetalhe({ titulo: item.nome, nomecusto: item.nome })
                      }
                    />
                  </TabsContent>
                  <TabsContent
                    value="empresas"
                    className="data-[state=inactive]:hidden print:data-[state=inactive]:block"
                    forceMount
                  >
                    <TabelaTop
                      titulo="Empresa"
                      itens={analise.topColigadas}
                      expandido={!!expandido.empresas}
                      onExpandir={() => setExpandido((p) => ({ ...p, empresas: !p.empresas }))}
                      onSelecionar={(item) =>
                        setDetalhe({ titulo: item.nome, nomecoligada: item.nome })
                      }
                    />
                  </TabsContent>
                </Tabs>
              </Card>

              <Secao
                titulo="Distribuição por empresa"
                subtitulo={`Participação no total de ${mesReferencia}`}
              >
                {analise.topColigadas.length ? (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(180, analise.topColigadas.slice(0, 8).length * 44)}
                  >
                    <BarChart
                      layout="vertical"
                      data={analise.topColigadas.slice(0, 8)}
                      margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="nome"
                        width={130}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number) => formatBRL(Number(v))}
                        cursor={{ fill: "var(--muted)" }}
                      />
                      <Bar
                        dataKey="valor"
                        name="Valor"
                        fill="var(--chart-1)"
                        radius={[0, 3, 3, 0]}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={(d: unknown) => {
                          const nome = (d as { payload: Item }).payload.nome;
                          setDetalhe({ titulo: nome, nomecoligada: nome });
                        }}
                      >
                        <LabelList
                          dataKey="pct"
                          position="right"
                          fontSize={10}
                          fill="var(--muted-foreground)"
                          formatter={(v: number) => pctTexto(v)}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sem lançamentos no mês.
                  </p>
                )}
              </Secao>
            </div>
          </>
        )}

        <p className="border-t border-border pt-5 text-xs text-muted-foreground">
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

      {/* Chat de IA exige login (consome créditos); oculto para visitantes do site publicado. */}
      {logado && (
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
      )}
    </AppLayout>
  );
}

/* ============================ Componentes ============================ */

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="h-48 w-full rounded-xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-72 w-full rounded-xl bg-muted" />
    </div>
  );
}

function Secao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 print:break-inside-avoid print:border-0 print:shadow-none">
      <CardContent className="p-5 sm:p-6 print:p-0">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {titulo}
        </p>
        {subtitulo && <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{subtitulo}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function CardIndicador({
  icone: Icone,
  rotulo,
  valor,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  valor: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="print:shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {rotulo}
          </p>
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Icone className="size-4" />
          </span>
        </div>
        <p className="mt-1 font-display text-xl font-semibold tabular-nums">{valor}</p>
        {children && <div className="mt-3 text-xs">{children}</div>}
      </CardContent>
    </Card>
  );
}

function LinhaDelta({ delta, percentual }: { delta: number; percentual: number }) {
  // Para despesa, cair é bom (verde) e subir é ruim (vermelho).
  const subiu = delta > 0;
  return (
    <p className="flex flex-wrap items-center gap-x-2">
      <span className="text-muted-foreground">Mês atual</span>
      <span className={`font-medium tabular-nums ${subiu ? "text-destructive" : "text-primary"}`}>
        {subiu ? "+" : ""}
        {formatBRL(delta)}
      </span>
      <Variacao percentual={percentual} />
    </p>
  );
}

function BarraComparativa({
  rotulo,
  valor,
  max,
  cor,
}: {
  rotulo: string;
  valor: number;
  max: number;
  cor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-muted-foreground">{rotulo}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${cor}`}
          style={{ width: `${(valor / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ChipVariacao({
  rotulo,
  percentual,
  disponivel,
}: {
  rotulo: string;
  percentual: number;
  disponivel: boolean;
}) {
  const subiu = percentual > 0;
  const cor =
    !disponivel || Math.abs(percentual) < 0.05
      ? "bg-muted text-muted-foreground"
      : subiu
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${cor}`}>
      <span className="opacity-80">{rotulo}</span>
      <Variacao percentual={percentual} disponivel={disponivel} />
    </span>
  );
}

function CartaoAtencao({
  tipo,
  nome,
  valor,
  detalhe,
  onClick,
}: {
  tipo: "alta" | "queda" | "novo";
  nome: string;
  valor: string;
  detalhe: string;
  onClick: () => void;
}) {
  const estilo = {
    alta: {
      rotulo: "Alta",
      icone: TrendingUp,
      cor: "border-destructive/40 text-destructive",
      fundo: "bg-destructive/10",
    },
    queda: {
      rotulo: "Queda",
      icone: TrendingDown,
      cor: "border-primary/40 text-primary",
      fundo: "bg-primary/10",
    },
    novo: {
      rotulo: "Não recorrente",
      icone: AlertTriangle,
      cor: "border-sidebar-primary/50 text-accent-foreground",
      fundo: "bg-accent",
    },
  }[tipo];
  const Icone = estilo.icone;
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-lg border-l-4 bg-card p-3 text-left shadow-xs transition-colors hover:bg-muted/50 ${estilo.cor}`}
    >
      <span className={`rounded-md p-1.5 ${estilo.fundo}`}>
        <Icone className="size-4" />
      </span>
      <span className="min-w-0">
        <span
          className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${estilo.fundo}`}
        >
          {estilo.rotulo}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">{nome}</span>
        <span className="block text-sm font-semibold tabular-nums">{valor}</span>
        <span className="block text-xs text-muted-foreground">{detalhe}</span>
      </span>
    </button>
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
  const maxPct = Math.max(...visiveis.map((i) => i.pct), 1);
  return (
    <div>
      <p className="mb-2 hidden text-xs font-semibold print:block">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm print:min-w-0">
          <thead>
            <tr className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              <th className="pb-2 text-left font-normal">Descrição</th>
              <th className="pb-2 text-right font-normal">Mês</th>
              <th className="w-36 pb-2 pl-4 text-left font-normal">% do total</th>
              <th className="pb-2 pl-3 text-right font-normal">Mês anterior</th>
              <th className="pb-2 pl-4 text-right font-normal">Variação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item) => {
              const varPct = item.anterior ? (item.delta / item.anterior) * 100 : 0;
              return (
                <tr
                  key={item.nome}
                  onClick={() => onSelecionar(item)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
                >
                  <td className="py-2.5 pr-3">{item.nome}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                    {formatBRL(item.valor)}
                  </td>
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(item.pct / maxPct) * 100}%` }}
                        />
                      </div>
                      <span className="w-11 text-right text-xs text-muted-foreground tabular-nums">
                        {pctTexto(item.pct)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatBRL(item.anterior)}
                  </td>
                  <td
                    className={`py-2.5 pl-4 text-right whitespace-nowrap tabular-nums ${
                      item.delta > 0 ? "text-destructive" : "text-primary"
                    }`}
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
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Nenhum lançamento neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {itens.length > TOP_PADRAO && (
        <div className="mt-2 text-right print:hidden">
          <Button variant="ghost" size="sm" onClick={onExpandir}>
            {expandido ? "Ver menos" : `Ver top ${TOP_EXPANDIDO}`}
          </Button>
        </div>
      )}
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
  const ordenadas = useMemo(
    () => linhas.slice().sort((a, b) => Math.abs(Number(b.vlcusto)) - Math.abs(Number(a.vlcusto))),
    [linhas],
  );
  const total = ordenadas.reduce((a, r) => a + Number(r.vlcusto), 0);
  return (
    <Dialog open={!!titulo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
            Detalhe de lançamentos
          </p>
          <DialogTitle className="text-base">{titulo}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[24rem] overflow-auto rounded-md border border-border max-sm:max-h-[60dvh]">
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
              {ordenadas.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1 whitespace-nowrap">
                    {new Date(r.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="max-w-40 truncate px-2 py-1">{r.produto}</td>
                  <td className="max-w-40 truncate px-2 py-1">{r.complemento}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.contacontabil}</td>
                  <td className="num px-2 py-1 text-right whitespace-nowrap">
                    {formatBRL(Number(r.vlcusto))}
                  </td>
                </tr>
              ))}
              {!ordenadas.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                    {carregando ? "Carregando lançamentos…" : "Nenhum lançamento encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!!ordenadas.length && (
          <p className="num text-right text-xs font-medium">Total: {formatBRL(total)}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
