import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchDespAdmSerie } from "@/lib/desp-adm";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, MESES } from "@/lib/balancete";
import { AlertTriangle, ArrowDown, ArrowUp, Download } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/desp-adm")({
  head: () => ({
    meta: [
      { title: "Despesas Administrativas | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Visão executiva de DESP. ADM (contas 3.4.01.*): evolução, variação, composição por centro de custo e rubrica.",
      },
    ],
  }),
  component: DespesasAdministrativas,
});

const hoje = new Date();
const CAT_DESP_ADM = "DESP. ADM";
const CAT_RECEITA = "RECEITA BRUTA";
const MESES_HISTORICO = 13;
const TOP_N = 6;

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
type Item = { nome: string; valor: number };
type Passo = {
  nome: string;
  valor: number;
  base: number;
  delta: number;
  especial?: boolean;
  total?: boolean;
};

function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}
function mesLabel(ano: number, mes: number) {
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

function DespesasAdministrativas() {
  const [refAno, setRefAno] = useState(hoje.getFullYear());
  const [refMes, setRefMes] = useState(hoje.getMonth() + 1);
  const [centros, setCentros] = useState<string[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [limiteAlerta, setLimiteAlerta] = useState(10);
  const [detalhe, setDetalhe] = useState<{
    nomedepto?: string;
    nomecusto?: string;
    contacontabil?: string;
  } | null>(null);

  const toggle = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);

  const serieQ = useQuery({
    queryKey: ["desp_adm_serie", refAno, refMes],
    retry: 1,
    queryFn: async () => {
      const data = await fetchDespAdmSerie(refAno, refMes, MESES_HISTORICO);
      return data as Linha[];
    },

  });

  const detalheQ = useQuery({
    queryKey: ["desp_adm_lancamentos", refAno, refMes, detalhe, centros, empresas],
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

  const erro = serieQ.error;

  const opcoes = useMemo(() => {
    const rows = serieQ.data ?? [];
    const centrosSet = new Set<string>();
    const empresasSet = new Set<string>();
    for (const r of rows) {
      if (r.categoria === CAT_DESP_ADM) centrosSet.add(r.nomedepto);
      empresasSet.add(r.nomecoligada);
    }
    return {
      centros: [...centrosSet].sort(),
      empresas: [...empresasSet].sort(),
    };
  }, [serieQ.data]);

  const analise = useMemo(() => {
    const rows = serieQ.data ?? [];
    const despRows = rows.filter(
      (r) =>
        r.categoria === CAT_DESP_ADM &&
        (!centros.length || centros.includes(r.nomedepto)) &&
        (!empresas.length || empresas.includes(r.nomecoligada)),
    );
    const receitaRows = rows.filter(
      (r) => r.categoria === CAT_RECEITA && (!empresas.length || empresas.includes(r.nomecoligada)),
    );

    const somaPeriodo = (linhas: Linha[], ano: number, mes: number) =>
      linhas.filter((r) => r.ano === ano && r.mes === mes).reduce((a, r) => a + Number(r.valor), 0);

    const periodos = periodosAte(refAno, refMes, MESES_HISTORICO);
    const evolucao = periodos.map((p) => ({
      periodo: mesLabel(p.ano, p.mes),
      valor: Math.abs(somaPeriodo(despRows, p.ano, p.mes)),
    }));

    const totalMesAtual = Math.abs(somaPeriodo(despRows, refAno, refMes));
    const ant = mesAnterior(refAno, refMes);
    const totalMesAnterior = Math.abs(somaPeriodo(despRows, ant.ano, ant.mes));
    const totalAnoAnterior = Math.abs(somaPeriodo(despRows, refAno - 1, refMes));
    const receitaBrutaMes = Math.abs(somaPeriodo(receitaRows, refAno, refMes));

    const variacaoMoM =
      totalMesAnterior !== 0 ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100 : null;
    const variacaoYoY =
      totalAnoAnterior !== 0 ? ((totalMesAtual - totalAnoAnterior) / totalAnoAnterior) * 100 : null;
    const pctSobreReceita = receitaBrutaMes !== 0 ? (totalMesAtual / receitaBrutaMes) * 100 : null;

    // Cascata: contribuição de cada centro de custo na variação do mês.
    const centrosAtual = new Map<string, number>();
    const centrosAnterior = new Map<string, number>();
    for (const r of despRows) {
      if (r.ano === refAno && r.mes === refMes)
        centrosAtual.set(r.nomedepto, (centrosAtual.get(r.nomedepto) ?? 0) + Number(r.valor));
      if (r.ano === ant.ano && r.mes === ant.mes)
        centrosAnterior.set(r.nomedepto, (centrosAnterior.get(r.nomedepto) ?? 0) + Number(r.valor));
    }
    const nomesCentros = new Set([...centrosAtual.keys(), ...centrosAnterior.keys()]);
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
      ...topDeltas.map((d) => ({ nome: d.nome, valor: d.delta })),
      ...(Math.abs(outrosDelta) >= 0.005
        ? [{ nome: "Outros centros", valor: outrosDelta, especial: true }]
        : []),
    ];

    let running = totalMesAnterior;
    const cascata: Passo[] = [
      {
        nome: "Mês anterior",
        valor: totalMesAnterior,
        base: 0,
        delta: totalMesAnterior,
        total: true,
      },
    ];
    for (const s of passosDelta) {
      const antes = running;
      const depois = running + s.valor;
      running = depois;
      cascata.push({ ...s, base: Math.min(antes, depois), delta: Math.abs(s.valor) });
    }
    cascata.push({
      nome: "Mês atual",
      valor: totalMesAtual,
      base: 0,
      delta: totalMesAtual,
      total: true,
    });

    const rowsAtual = despRows.filter((r) => r.ano === refAno && r.mes === refMes);
    const topCentros = agrupar(rowsAtual, "nomedepto").slice(0, 5);
    const topRubricas = agrupar(rowsAtual, "nomecusto").slice(0, 5);
    const topContas = agrupar(rowsAtual, "contacontabil").slice(0, 5);

    return {
      evolucao,
      totalMesAtual,
      totalMesAnterior,
      totalAnoAnterior,
      variacaoMoM,
      variacaoYoY,
      pctSobreReceita,
      cascata,
      topCentros,
      topRubricas,
      topContas,
    };
  }, [serieQ.data, refAno, refMes, centros, empresas]);

  const carregando = serieQ.isLoading;
  const semDados = !carregando && !erro && !analise.topCentros.length;
  const alertaAtivo = analise.variacaoMoM !== null && Math.abs(analise.variacaoMoM) > limiteAlerta;

  const mesesOpcoes = useMemo(() => periodosAte(hoje.getFullYear(), hoje.getMonth() + 1, 25), []);

  return (
    <AppLayout
      titulo="Despesas Administrativas"
      descricao={`DESP. ADM (contas 3.4.01.*) — referência ${mesLabel(refAno, refMes)}`}
      acoes={
        <Button onClick={() => window.print()}>
          <Download className="size-4" /> Exportar PDF
        </Button>
      }
    >
      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível carregar os dados de DESP. ADM.</p>
            <p className="mt-0.5">
              {(erro as { message?: string }).message ?? String(erro)} — se o erro mencionar uma
              função inexistente, a migration deste recurso ainda não foi sincronizada no banco.
            </p>
          </div>
        </div>
      )}

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Mês de referência</label>
              <select
                value={`${refAno}-${refMes}`}
                onChange={(e) => {
                  const [a, m] = e.target.value.split("-").map(Number);
                  setRefAno(a);
                  setRefMes(m);
                }}
                className="block w-40 rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {mesesOpcoes
                  .slice()
                  .reverse()
                  .map((p) => (
                    <option key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>
                      {mesLabel(p.ano, p.mes)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Limite de alerta na variação MoM (%)
              </label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={limiteAlerta}
                onChange={(e) => setLimiteAlerta(Number(e.target.value) || 0)}
                className="w-32"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Centro de custo {centros.length > 0 && `(${centros.length} selecionado(s))`}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {opcoes.centros.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(centros, setCentros, c)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    centros.includes(c)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
              {!opcoes.centros.length && (
                <span className="text-xs text-muted-foreground">
                  Nenhum centro de custo carregado ainda.
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Empresa {empresas.length > 0 && `(${empresas.length} selecionada(s))`}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {opcoes.empresas.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggle(empresas, setEmpresas, e)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    empresas.includes(e)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
              {!opcoes.empresas.length && (
                <span className="text-xs text-muted-foreground">
                  Nenhuma empresa carregada ainda.
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {alertaAtivo && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          Variação de {analise.variacaoMoM! >= 0 ? "+" : ""}
          {analise.variacaoMoM!.toFixed(1)}% em relação ao mês anterior — acima do limite
          configurado ({limiteAlerta}%).
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Total do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold">{formatBRL(analise.totalMesAtual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mês anterior
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold text-muted-foreground">
              {formatBRL(analise.totalMesAnterior)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Variação MoM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VariacaoValor percentual={analise.variacaoMoM} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Variação YoY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VariacaoValor percentual={analise.variacaoYoY} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              % sobre Receita Bruta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold">
              {analise.pctSobreReceita === null ? "—" : `${analise.pctSobreReceita.toFixed(2)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução — últimos {MESES_HISTORICO} meses</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {semDados ? (
            <p className="text-sm text-muted-foreground">
              Nenhum lançamento de DESP. ADM no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analise.evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Por que variou — {mesLabel(refAno, refMes)} vs mês anterior
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Contribuição de cada centro de custo na variação do total. Vermelho aumenta a despesa,
            verde reduz. Clique numa barra para ver os lançamentos.
          </p>
        </CardHeader>
        <CardContent className="h-80">
          {semDados ? (
            <p className="text-sm text-muted-foreground">Sem dados para montar a cascata.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analise.cascata} margin={{ top: 16, right: 8, left: 0, bottom: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={90}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { nome: string; valor: number };
                    return (
                      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{p.nome}</p>
                        <p className="num mt-1">{formatBRL(p.valor)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
                <Bar
                  dataKey="delta"
                  stackId="wf"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                  onClick={(d: unknown) => {
                    const payload = (d as { payload: Passo }).payload;
                    if (payload.especial || payload.total) return;
                    setDetalhe({ nomedepto: payload.nome });
                  }}
                >
                  {analise.cascata.map((s, i) => (
                    <Cell
                      key={i}
                      fill={
                        s.total
                          ? "var(--chart-3)"
                          : s.valor >= 0
                            ? "var(--destructive)"
                            : "var(--primary)"
                      }
                      cursor={s.especial || s.total ? "default" : "pointer"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RankingCard
          titulo="Top 5 — Conta Contábil"
          itens={analise.topContas}
          total={analise.totalMesAtual}
          onClick={(nome) => setDetalhe({ contacontabil: nome })}
        />
        <RankingCard
          titulo="Top 5 — Rubrica (NOMECUSTO)"
          itens={analise.topRubricas}
          total={analise.totalMesAtual}
          onClick={(nome) => setDetalhe({ nomecusto: nome })}
        />
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              DESP. ADM · {detalhe?.nomedepto ?? detalhe?.nomecusto ?? detalhe?.contacontabil} ·{" "}
              {mesLabel(refAno, refMes)}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[24rem] overflow-auto rounded-md border border-border">
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
                {(detalheQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="num px-2 py-1">
                      {new Date(r.data as string).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="max-w-56 truncate px-2 py-1">{r.produto}</td>
                    <td className="max-w-56 truncate px-2 py-1">{r.complemento}</td>
                    <td className="px-2 py-1">{r.contacontabil}</td>
                    <td className="num px-2 py-1 text-right">{formatBRL(Number(r.vlcusto))}</td>
                  </tr>
                ))}
                {!detalheQ.data?.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="num text-right text-xs font-medium">
            Total: {formatBRL((detalheQ.data ?? []).reduce((a, r) => a + Number(r.vlcusto), 0))}
          </p>
        </DialogContent>
      </Dialog>

      <ChatBalancete
        contexto={`Mês/ano de referência selecionado na tela: ${refMes}/${refAno}.`}
        sugestoes={[
          `Total de DESP. ADM em ${mesLabel(refAno, refMes)}`,
          "Comparar os últimos 3 meses",
          "Maiores contas contábeis do mês",
          "Maiores centros de custo do mês",
        ]}
      />
    </AppLayout>
  );
}

function VariacaoValor({ percentual }: { percentual: number | null }) {
  if (percentual === null)
    return <p className="num text-2xl font-semibold text-muted-foreground">—</p>;
  const subiu = percentual > 0;
  const Icon = subiu ? ArrowUp : ArrowDown;
  return (
    <p
      className={`num flex items-center gap-1 text-2xl font-semibold ${subiu ? "text-destructive" : "text-primary"}`}
    >
      <Icon className="size-5" />
      {subiu ? "+" : ""}
      {percentual.toFixed(1)}%
    </p>
  );
}

function RankingCard({
  titulo,
  itens,
  total,
  onClick,
}: {
  titulo: string;
  itens: Item[];
  total: number;
  onClick: (nome: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-medium">Nome</th>
              <th className="px-2 py-2 text-right font-medium">Valor</th>
              <th className="px-2 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const pct = total ? (i.valor / total) * 100 : 0;
              return (
                <tr
                  key={i.nome}
                  className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                  onClick={() => onClick(i.nome)}
                >
                  <td className="relative px-2 py-1.5">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                    <span className="relative">{i.nome}</span>
                  </td>
                  <td className="num relative px-2 py-1.5 text-right">{formatBRL(i.valor)}</td>
                  <td className="num relative px-2 py-1.5 text-right text-muted-foreground">
                    {pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
            {!itens.length && (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                  Nenhum lançamento neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
