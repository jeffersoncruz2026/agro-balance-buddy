import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { formatBRL, MESES } from "@/lib/balancete";
import { ArrowUpRight, ArrowDownRight, Download, SlidersHorizontal, X } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  LineChart,
  Line,
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
          "Relatório executivo de Despesas Administrativas (DESP. ADM): número-âncora, leitura executiva, evolução, composição da variação e principais contas/rubricas.",
      },
    ],
  }),
  component: AnaliseDespesasAdm,
});

const hoje = new Date();
const CAT_DESP_ADM = "DESP. ADM";
const CAT_RECEITA = "RECEITA BRUTA";
const MESES_HISTORICO = 12;
const LIMITE_ALERTA_PERCENTUAL = 10;

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
type Item = { nome: string; codigo?: string; valor: number };

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
function agrupar(rows: Linha[], chave: "nomedepto" | "nomecusto" | "contacontabil"): Item[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r[chave], (m.get(r[chave]) ?? 0) + Number(r.valor));
  return [...m.entries()]
    .map(([nome, valor]) => ({ nome, valor: Math.abs(valor) }))
    .filter((i) => i.valor >= 0.005)
    .sort((a, b) => b.valor - a.valor);
}
function formatPct(v: number, sinal = true) {
  return `${sinal && v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function AnaliseDespesasAdm() {
  const [refAno, setRefAno] = useState(hoje.getFullYear());
  const [refMes, setRefMes] = useState(hoje.getMonth() + 1);
  const [centros, setCentros] = useState<string[]>([]);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<{
    titulo: string;
    nomedepto?: string;
    nomecusto?: string;
    contacontabil?: string;
  } | null>(null);

  const serieQ = useQuery({
    queryKey: ["desp_adm_serie", refAno, refMes, "analise"],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("desp_adm_serie", {
        p_ano_ref: refAno,
        p_mes_ref: refMes,
        p_meses: MESES_HISTORICO,
      });
      if (error) throw error;
      return (data ?? []) as Linha[];
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
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const opcoesCentros = useMemo(() => {
    const set = new Set<string>();
    for (const r of serieQ.data ?? []) if (r.categoria === CAT_DESP_ADM) set.add(r.nomedepto);
    return [...set].sort();
  }, [serieQ.data]);

  const mesReferencia = mesLabelCurto(refAno, refMes);

  const analise = useMemo(() => {
    const rows = serieQ.data ?? [];
    const despRows = rows.filter(
      (r) => r.categoria === CAT_DESP_ADM && (!centros.length || centros.includes(r.nomedepto)),
    );
    const receitaRows = rows.filter((r) => r.categoria === CAT_RECEITA);

    const somaPeriodo = (linhas: Linha[], ano: number, mes: number) =>
      linhas.filter((r) => r.ano === ano && r.mes === mes).reduce((a, r) => a + Number(r.valor), 0);

    const periodos = periodosAte(refAno, refMes, MESES_HISTORICO);
    const evolucao = periodos.map((p) => ({
      mes: mesLabelCurto(p.ano, p.mes),
      valor: Math.abs(somaPeriodo(despRows, p.ano, p.mes)),
    }));

    const totalMesAtual = Math.abs(somaPeriodo(despRows, refAno, refMes));
    const ant = mesAnterior(refAno, refMes);
    const totalMesAnterior = Math.abs(somaPeriodo(despRows, ant.ano, ant.mes));
    const totalMesmoMesAnoAnterior = Math.abs(somaPeriodo(despRows, refAno - 1, refMes));
    const receitaBrutaMes = Math.abs(somaPeriodo(receitaRows, refAno, refMes));

    const variacaoMoM =
      totalMesAnterior !== 0 ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100 : 0;
    const variacaoYoY =
      totalMesmoMesAnoAnterior !== 0
        ? ((totalMesAtual - totalMesmoMesAnoAnterior) / totalMesmoMesAnoAnterior) * 100
        : 0;
    const pctSobreReceita = receitaBrutaMes !== 0 ? (totalMesAtual / receitaBrutaMes) * 100 : 0;

    // Ponte: contribuição de cada centro de custo na variação do mês.
    const centrosAtual = new Map<string, number>();
    const centrosAnterior = new Map<string, number>();
    for (const r of despRows) {
      if (r.ano === refAno && r.mes === refMes)
        centrosAtual.set(r.nomedepto, (centrosAtual.get(r.nomedepto) ?? 0) + Number(r.valor));
      if (r.ano === ant.ano && r.mes === ant.mes)
        centrosAnterior.set(r.nomedepto, (centrosAnterior.get(r.nomedepto) ?? 0) + Number(r.valor));
    }
    const nomesCentros = new Set([...centrosAtual.keys(), ...centrosAnterior.keys()]);
    const TOP_N = 6;
    const deltas = [...nomesCentros]
      .map((nome) => ({
        nome,
        delta: Math.abs(centrosAtual.get(nome) ?? 0) - Math.abs(centrosAnterior.get(nome) ?? 0),
      }))
      .filter((d) => Math.abs(d.delta) >= 0.005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const topDeltas = deltas.slice(0, TOP_N);
    const outrosDelta = deltas.slice(TOP_N).reduce((a, d) => a + d.delta, 0);
    const passosDelta = [
      ...topDeltas,
      ...(Math.abs(outrosDelta) >= 0.005 ? [{ nome: "Outros centros", delta: outrosDelta }] : []),
    ];

    let acumulado = totalMesAnterior;
    const ponteData: {
      nome: string;
      base: number;
      valor: number;
      tipo: "total" | "alta" | "queda";
      deltaOriginal?: number;
    }[] = [{ nome: "Mês anterior", base: 0, valor: totalMesAnterior, tipo: "total" }];
    for (const d of passosDelta) {
      const inicio = d.delta >= 0 ? acumulado : acumulado + d.delta;
      ponteData.push({
        nome: d.nome,
        base: inicio,
        valor: Math.abs(d.delta),
        tipo: d.delta >= 0 ? "alta" : "queda",
        deltaOriginal: d.delta,
      });
      acumulado += d.delta;
    }
    ponteData.push({ nome: "Mês atual", base: 0, valor: acumulado, tipo: "total" });

    const maiorAlta = topDeltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const maiorQueda = topDeltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];

    const rowsAtual = despRows.filter((r) => r.ano === refAno && r.mes === refMes);
    const topContas = agrupar(rowsAtual, "contacontabil").slice(0, 5);
    const topRubricas = agrupar(rowsAtual, "nomecusto").slice(0, 5);

    return {
      evolucao,
      totalMesAtual,
      totalMesAnterior,
      totalMesmoMesAnoAnterior,
      variacaoMoM,
      variacaoYoY,
      pctSobreReceita,
      ponteData,
      maiorAlta,
      maiorQueda,
      topContas,
      topRubricas,
    };
  }, [serieQ.data, refAno, refMes, centros]);

  const leituraExecutiva = useMemo(() => {
    const direcao = analise.variacaoMoM > 0 ? "alta" : "queda";
    let texto = `As despesas administrativas somaram ${formatBRL(analise.totalMesAtual)} em ${mesReferencia}, ${direcao} de ${formatPct(Math.abs(analise.variacaoMoM), false)} sobre o mês anterior`;
    if (analise.maiorAlta) {
      texto += `, impulsionada principalmente por ${analise.maiorAlta.nome} (+${formatBRL(analise.maiorAlta.delta)})`;
    }
    if (analise.maiorQueda) {
      texto += ` e parcialmente compensada pela redução em ${analise.maiorQueda.nome} (${formatBRL(analise.maiorQueda.delta)})`;
    }
    texto += `. No período, essas despesas representaram ${analise.pctSobreReceita.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da receita bruta.`;
    return texto;
  }, [analise, mesReferencia]);

  const alertaAtivo = Math.abs(analise.variacaoMoM) > LIMITE_ALERTA_PERCENTUAL;
  const mesesOpcoes = useMemo(() => periodosAte(hoje.getFullYear(), hoje.getMonth() + 1, 25), []);

  function toggleCentro(nome: string) {
    setCentros((prev) => (prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome]));
  }

  return (
    <AppLayout
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
              Centro de custo
              {centros.length > 0 && (
                <span className="text-[11px] text-primary">({centros.length})</span>
              )}
            </button>
            {filtroAberto && (
              <div className="absolute right-0 z-10 mt-2 w-64 border border-border bg-card p-3 shadow-sm">
                {opcoesCentros.map((opcao) => (
                  <label
                    key={opcao}
                    className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={centros.includes(opcao)}
                      onChange={() => toggleCentro(opcao)}
                    />
                    {opcao}
                  </label>
                ))}
                {!opcoesCentros.length && (
                  <span className="text-xs text-muted-foreground">Nenhum centro carregado.</span>
                )}
              </div>
            )}
          </div>

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
      <div className="mx-auto max-w-5xl px-2 py-2 print:max-w-none">
        {serieQ.error && (
          <p className="mb-6 text-sm text-destructive">
            Não foi possível carregar os dados —{" "}
            {(serieQ.error as { message?: string }).message ?? String(serieQ.error)}
          </p>
        )}

        {/* NÚMERO-ÂNCORA + LEITURA EXECUTIVA */}
        <div className="mb-10">
          <div className="flex flex-wrap items-end gap-4">
            <span className="font-serif text-[44px] leading-none">
              {formatBRL(analise.totalMesAtual)}
            </span>
            <div className="flex items-center gap-3 pb-1.5 text-sm">
              <span className="text-muted-foreground">vs. mês anterior</span>
              <Variacao percentual={analise.variacaoMoM} />
              <span className="text-border">|</span>
              <span className="text-muted-foreground">
                vs. {mesReferencia.split("/")[0]}/ano anterior
              </span>
              <Variacao percentual={analise.variacaoYoY} />
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
        <div className="mb-10 grid grid-cols-2 border-t border-b border-border sm:grid-cols-4">
          {[
            { label: "Mês atual", value: formatBRL(analise.totalMesAtual) },
            { label: "Mês anterior", value: formatBRL(analise.totalMesAnterior) },
            {
              label: "Mesmo mês, ano anterior",
              value: formatBRL(analise.totalMesmoMesAnoAnterior),
            },
            {
              label: "% sobre a receita bruta",
              value: `${analise.pctSobreReceita.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
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

        {/* EVOLUÇÃO */}
        <div className="mb-10">
          <p className="mb-3 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Evolução — últimos {MESES_HISTORICO} meses
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={analise.evolucao} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
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
                formatter={(v: number) => formatBRL(Number(v))}
                contentStyle={{ fontSize: 13, border: "1px solid var(--border)" }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="var(--foreground)"
                strokeWidth={1.75}
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* PONTE DE VARIAÇÃO */}
        <div className="mb-10">
          <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Composição da variação — {mesReferencia} vs. mês anterior
          </p>
          <p className="mb-3 text-sm text-muted-foreground">
            Contribuição de cada centro de custo para a mudança do total
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
                    p.tipo === "total" ? p.valor : (p.deltaOriginal ?? 0) >= 0 ? p.valor : -p.valor;
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
                  const payload = (d as { payload: (typeof analise.ponteData)[number] }).payload;
                  if (payload.tipo === "total" || payload.nome === "Outros centros") return;
                  setDetalhe({ titulo: payload.nome, nomedepto: payload.nome });
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
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
          <div>
            <p className="mb-3 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Principais despesas — Conta Contábil
            </p>
            <table className="w-full text-sm">
              <tbody>
                {analise.topContas.map((item) => (
                  <tr
                    key={item.nome}
                    onClick={() => setDetalhe({ titulo: item.nome, contacontabil: item.nome })}
                    className="cursor-pointer border-t border-border"
                  >
                    <td className="py-2.5 pr-3">{item.nome}</td>
                    <td className="py-2.5 text-right font-serif whitespace-nowrap">
                      {formatBRL(item.valor)}
                    </td>
                  </tr>
                ))}
                {!analise.topContas.length && (
                  <tr>
                    <td colSpan={2} className="py-3 text-center text-muted-foreground">
                      Nenhum lançamento neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-3 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Principais despesas — Rubrica
            </p>
            <table className="w-full text-sm">
              <tbody>
                {analise.topRubricas.map((item) => (
                  <tr
                    key={item.nome}
                    onClick={() => setDetalhe({ titulo: item.nome, nomecusto: item.nome })}
                    className="cursor-pointer border-t border-border"
                  >
                    <td className="py-2.5 pr-3">{item.nome}</td>
                    <td className="py-2.5 text-right font-serif whitespace-nowrap">
                      {formatBRL(item.valor)}
                    </td>
                  </tr>
                ))}
                {!analise.topRubricas.length && (
                  <tr>
                    <td colSpan={2} className="py-3 text-center text-muted-foreground">
                      Nenhum lançamento neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
          Valores apurados a partir da base contábil e dos ajustes gerenciais do período. Relatório
          de uso interno.
        </p>
      </div>

      <DrilldownModal
        titulo={detalhe?.titulo ?? null}
        linhas={detalheQ.data ?? []}
        onClose={() => setDetalhe(null)}
      />
    </AppLayout>
  );
}

function Variacao({ percentual }: { percentual: number }) {
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
  onClose,
}: {
  titulo: string | null;
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
                    Nenhum lançamento encontrado.
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
