import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, MESES, safraDe, safraLabel } from "@/lib/balancete";
import { AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  Scatter,
  ReferenceLine,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/resultado-financeiro")({
  head: () => ({
    meta: [
      { title: "Abertura Resultado Financeiro | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Receitas e Despesas Financeiras analisadas separadamente, por natureza da conta, com os ajustes do Balancete reconciliados.",
      },
    ],
  }),
  component: ResultadoFinanceiro,
});

const hoje = new Date();

type Linha = { mes: number; ano: number; categoria: string; nomeconta: string; valor: number };
type Ajuste = {
  id: string;
  safra_ano: number;
  mes: number;
  categoria: string;
  valor: number;
  descricao: string;
};
type Item = { categoria: string; nomeconta: string; valor: number };
type Passo = {
  nome: string;
  valor: number;
  categoria?: string;
  nomeconta?: string;
  especial?: boolean;
  total?: boolean;
  base: number;
  delta: number;
  /** Valor da mesma natureza na safra anterior — usado no marcador de comparação da cascata. */
  anterior?: number;
  /** Posição (na mesma escala da cascata) onde o marcador da safra anterior deve ficar. */
  anteriorY?: number | null;
};

const CAT_DESP = "DESPESAS FINANCEIRAS";
const CAT_REC = "RECEITAS FINANCEIRAS";
const TOP_N = 8;

function agruparPorNatureza(rows: Linha[], categoria: string): Item[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.categoria !== categoria) continue;
    m.set(r.nomeconta, (m.get(r.nomeconta) ?? 0) + Number(r.valor));
  }
  return [...m.entries()]
    .map(([nomeconta, valor]) => ({ categoria, nomeconta, valor }))
    .filter((i) => Math.abs(i.valor) >= 0.005)
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}

/** Monta as barras da cascata; a barra final usa o total já reconciliado com o Balancete. */
function montarCascata(
  itens: Item[],
  itensAnt: Item[],
  ajusteValor: number,
  totalBalancete: number,
  rotuloTotal: string,
): Passo[] {
  const top = itens.slice(0, TOP_N);
  const outrasValor = itens.slice(TOP_N).reduce((a, i) => a + i.valor, 0);
  const mapAnt = new Map(itensAnt.map((i) => [i.nomeconta, i.valor]));

  const passos: Omit<Passo, "base" | "delta" | "anteriorY">[] = [
    ...top.map((i) => ({
      nome: i.nomeconta,
      valor: i.valor,
      categoria: i.categoria,
      nomeconta: i.nomeconta,
      anterior: mapAnt.get(i.nomeconta),
    })),
    ...(Math.abs(outrasValor) >= 0.005
      ? [{ nome: "Outras contas", valor: outrasValor, especial: true }]
      : []),
    ...(Math.abs(ajusteValor) >= 0.005
      ? [{ nome: "Ajustes do Balancete", valor: ajusteValor, especial: true }]
      : []),
  ];

  let running = 0;
  const cascata = passos.map((s) => {
    const antes = running;
    const depois = running + s.valor;
    running = depois;
    const anteriorY = s.anterior != null ? antes + s.anterior : null;
    return { ...s, base: Math.min(antes, depois), delta: Math.abs(s.valor), anteriorY };
  });
  cascata.push({
    nome: rotuloTotal,
    valor: totalBalancete,
    especial: true,
    total: true,
    base: Math.min(0, totalBalancete),
    delta: Math.abs(totalBalancete),
    anteriorY: null,
  });
  return cascata;
}

/** Marcador (tick) mostrando onde a mesma natureza terminava na safra anterior. */
function MarcadorAnterior(rawProps: unknown) {
  const { cx, cy } = rawProps as { cx?: number; cy?: number };
  if (cx == null || cy == null) return <g />;
  return (
    <line
      x1={cx - 12}
      x2={cx + 12}
      y1={cy}
      y2={cy}
      stroke="var(--muted-foreground)"
      strokeWidth={2}
    />
  );
}

/** Rótulo do ranking: fica do lado de fora da ponta da barra, à direita para valores positivos e à esquerda para negativos. */
function RotuloBarraRanking(rawProps: unknown) {
  const { x, y, width, height, value } = rawProps as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number;
  };
  if (x == null || y == null || width == null || height == null || value == null) return <g />;
  const positivo = Number(value) >= 0;
  return (
    <text
      x={positivo ? x + width + 6 : x - 6}
      y={y + height / 2}
      dy={3.5}
      textAnchor={positivo ? "start" : "end"}
      fontSize={10.5}
      fontWeight={600}
      fill="var(--foreground)"
      className="num"
    >
      {formatBRL(Number(value))}
    </text>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.12}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ResultadoFinanceiro() {
  const [detalhe, setDetalhe] = useState<{ categoria: string; nomeconta: string } | null>(null);

  const cfg = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const inicioSafra = cfg.data?.safra_start_month ?? 4;
  const safraPadrao = safraDe(hoje.getFullYear(), hoje.getMonth() + 1, inicioSafra);
  const [safraAtual, setSafraAtual] = useState(safraPadrao);
  const [meses, setMeses] = useState<number[]>([hoje.getMonth() + 1]);

  /** Meses na ordem do ano-safra (Abril → Março, conforme configuração). */
  const mesesOrdem = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ((inicioSafra - 1 + i) % 12) + 1),
    [inicioSafra],
  );
  const mesesSel = useMemo(() => mesesOrdem.filter((m) => meses.includes(m)), [mesesOrdem, meses]);
  const anoCivil = (m: number, safra: number) => (m >= inicioSafra ? safra : safra + 1);
  const periodoLabel = mesesSel.length
    ? mesesSel.map((m) => MESES[m - 1]).join(", ")
    : "nenhum mês selecionado";

  const toggleMes = (m: number) =>
    setMeses((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const rfQ = useQuery({
    queryKey: ["resultado_financeiro", safraAtual],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resultado_financeiro", {
        p_safra_ano: safraAtual,
      });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const rfAntQ = useQuery({
    queryKey: ["resultado_financeiro", safraAtual - 1],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resultado_financeiro", {
        p_safra_ano: safraAtual - 1,
      });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const ajustesQ = useQuery({
    queryKey: ["ajustes-financeiro", safraAtual],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ajustes")
        .select("*")
        .in("safra_ano", [safraAtual - 1, safraAtual])
        .in("categoria", [CAT_DESP, CAT_REC]);
      if (error) throw error;
      return (data ?? []) as unknown as Ajuste[];
    },
  });

  const detalheQ = useQuery({
    queryKey: ["resultado_financeiro_detalhe", safraAtual, detalhe],
    enabled: !!detalhe,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resultado_financeiro_detalhe", {
        p_safra_ano: safraAtual,
        p_categoria: detalhe!.categoria,
        p_nomeconta: detalhe!.nomeconta,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const erro = cfg.error || rfQ.error || rfAntQ.error || ajustesQ.error;

  /** Lançamentos do drill-down restritos aos meses selecionados no período. */
  const detalheFiltrado = useMemo(
    () =>
      (detalheQ.data ?? []).filter((r) => mesesSel.includes(Number(String(r.data).slice(5, 7)))),
    [detalheQ.data, mesesSel],
  );

  const rawSoma = (rows: Linha[], categoria: string) =>
    rows.filter((r) => r.categoria === categoria).reduce((a, r) => a + Number(r.valor), 0);
  const somaAjustes = (ajustes: Ajuste[], categoria: string) =>
    ajustes.filter((a) => a.categoria === categoria).reduce((a, r) => a + Number(r.valor), 0);

  const analise = useMemo(() => {
    const rows = (rfQ.data ?? []).filter((r) => mesesSel.includes(r.mes));
    const rowsAnt = (rfAntQ.data ?? []).filter((r) => mesesSel.includes(r.mes));
    const ajustesAtual = (ajustesQ.data ?? []).filter(
      (a) => a.safra_ano === safraAtual && mesesSel.includes(a.mes),
    );
    const ajustesAnt = (ajustesQ.data ?? []).filter(
      (a) => a.safra_ano === safraAtual - 1 && mesesSel.includes(a.mes),
    );

    // Mesma fórmula de sinal usada no Balancete (DESPESAS FINANCEIRAS e
    // RECEITAS FINANCEIRAS), para o total desta tela bater com o Balancete.
    const ajusteDesp = somaAjustes(ajustesAtual, CAT_DESP);
    const ajusteRec = somaAjustes(ajustesAtual, CAT_REC);
    const despesas = -Math.abs(rawSoma(rows, CAT_DESP)) + ajusteDesp;
    const receitas = Math.abs(rawSoma(rows, CAT_REC)) + ajusteRec;
    const liquido = despesas + receitas;

    const ajusteDespAnt = somaAjustes(ajustesAnt, CAT_DESP);
    const ajusteRecAnt = somaAjustes(ajustesAnt, CAT_REC);
    const despesasAnt = -Math.abs(rawSoma(rowsAnt, CAT_DESP)) + ajusteDespAnt;
    const receitasAnt = Math.abs(rawSoma(rowsAnt, CAT_REC)) + ajusteRecAnt;
    const liquidoAnt = despesasAnt + receitasAnt;
    const variacao =
      liquidoAnt !== 0 ? ((liquido - liquidoAnt) / Math.abs(liquidoAnt)) * 100 : null;

    // Abertura por natureza (nomeconta), receitas e despesas separadas.
    const itensDesp = agruparPorNatureza(rows, CAT_DESP);
    const itensRec = agruparPorNatureza(rows, CAT_REC);
    const itensDespAnt = agruparPorNatureza(rowsAnt, CAT_DESP);
    const itensRecAnt = agruparPorNatureza(rowsAnt, CAT_REC);
    const massaDesp = itensDesp.reduce((a, i) => a + Math.abs(i.valor), 0);
    const massaRec = itensRec.reduce((a, i) => a + Math.abs(i.valor), 0);

    const cascataDesp = montarCascata(
      itensDesp,
      itensDespAnt,
      ajusteDesp,
      despesas,
      "Total Despesas Financeiras",
    );
    const cascataRec = montarCascata(
      itensRec,
      itensRecAnt,
      ajusteRec,
      receitas,
      "Total Receitas Financeiras",
    );

    // Evolução mensal, restrita aos meses selecionados (ordem da safra) —
    // mesma convenção de sinal do total (receita positiva, despesa negativa)
    // para a área divergente ficar coerente com os KPIs.
    const mensal = mesesOrdem
      .filter((m) => mesesSel.includes(m))
      .map((m) => {
        const doMes = rows.filter((r) => r.mes === m);
        const rec = Math.abs(
          doMes.filter((r) => r.categoria === CAT_REC).reduce((a, r) => a + Number(r.valor), 0),
        );
        const desp = -Math.abs(
          doMes.filter((r) => r.categoria === CAT_DESP).reduce((a, r) => a + Number(r.valor), 0),
        );
        const ano = doMes[0]?.ano ?? anoCivil(m, safraAtual);
        return {
          periodo: `${MESES[m - 1].slice(0, 3)}/${String(ano).slice(2)}`,
          Receitas: rec,
          Despesas: desp,
          Líquido: rec + desp,
        };
      });

    // Série completa da safra (todos os meses, sem o filtro de seleção) —
    // usada só para as sparklines dos KPIs, que mostram a tendência do ano
    // inteiro independente dos meses selecionados na tela.
    const rowsAll = rfQ.data ?? [];
    const rowsAntAll = rfAntQ.data ?? [];
    const calcMes = (fonte: Linha[], m: number) => {
      const doMes = fonte.filter((r) => r.mes === m);
      const rec = Math.abs(
        doMes.filter((r) => r.categoria === CAT_REC).reduce((a, r) => a + Number(r.valor), 0),
      );
      const desp = -Math.abs(
        doMes.filter((r) => r.categoria === CAT_DESP).reduce((a, r) => a + Number(r.valor), 0),
      );
      return { rec, desp, liquido: rec + desp };
    };
    const mensalCompleto = mesesOrdem.map((m) => calcMes(rowsAll, m));
    const mensalCompletoAnt = mesesOrdem.map((m) => calcMes(rowsAntAll, m));
    const sparkReceitas = mensalCompleto.map((x) => x.rec);
    const sparkDespesas = mensalCompleto.map((x) => Math.abs(x.desp));
    const sparkLiquido = mensalCompleto.map((x) => x.liquido);
    const sparkVariacao = mensalCompleto.map((x, i) => x.liquido - mensalCompletoAnt[i].liquido);

    return {
      receitas,
      despesas,
      liquido,
      variacao,
      itensDesp,
      itensRec,
      massaDesp,
      massaRec,
      cascataDesp,
      cascataRec,
      mensal,
      sparkReceitas,
      sparkDespesas,
      sparkLiquido,
      sparkVariacao,
    };
  }, [rfQ.data, rfAntQ.data, ajustesQ.data, safraAtual, mesesOrdem, mesesSel, inicioSafra]);

  const carregando = rfQ.isLoading || rfAntQ.isLoading;
  const semDados = !carregando && !erro && !analise.itensDesp.length && !analise.itensRec.length;

  const abrirDetalhe = (s: { especial?: boolean; categoria?: string; nomeconta?: string }) => {
    if (s.especial || !s.categoria || !s.nomeconta) return;
    setDetalhe({ categoria: s.categoria, nomeconta: s.nomeconta });
  };

  return (
    <AppLayout
      titulo="Abertura Resultado Financeiro"
      descricao={`Receitas e Despesas Financeiras analisadas separadamente — ${periodoLabel} · safra ${safraLabel(safraAtual)} vs ${safraLabel(safraAtual - 1)}`}
    >
      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              Não foi possível carregar os dados do resultado financeiro.
            </p>
            <p className="mt-0.5">
              {(erro as { message?: string }).message ?? String(erro)} — se o erro mencionar uma
              função inexistente, a migration deste recurso ainda não foi sincronizada no banco.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período da análise</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ano-safra</label>
              <Select value={String(safraAtual)} onValueChange={(v) => setSafraAtual(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }, (_, i) => safraPadrao + 2 - i).map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {safraLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMeses(mesesOrdem)}>
              Safra inteira
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMeses(mesesOrdem.slice(0, mesesOrdem.indexOf(hoje.getMonth() + 1) + 1))
              }
            >
              Até o mês atual
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMeses([])}>
              Limpar
            </Button>
          </div>

          <label className="text-xs text-muted-foreground">
            Meses ({MESES[inicioSafra - 1]} a {MESES[(inicioSafra + 10) % 12]})
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {mesesOrdem.map((m) => {
              const ativo = meses.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMes(m)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    ativo
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  {MESES[m - 1]}
                  <span className="ml-1 opacity-70">
                    /{String(anoCivil(m, safraAtual)).slice(2)}
                  </span>
                </button>
              );
            })}
          </div>

          {!mesesSel.length && (
            <p className="mt-3 text-xs text-destructive">
              Selecione ao menos um mês para gerar a análise.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Receitas financeiras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold text-primary">{formatBRL(analise.receitas)}</p>
            <Sparkline data={analise.sparkReceitas} color="var(--primary)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Despesas financeiras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold text-destructive">
              {formatBRL(analise.despesas)}
            </p>
            <Sparkline data={analise.sparkDespesas} color="var(--destructive)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Resultado financeiro líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`num text-2xl font-semibold ${analise.liquido < 0 ? "text-destructive" : "text-primary"}`}
            >
              {formatBRL(analise.liquido)}
            </p>
            <Sparkline
              data={analise.sparkLiquido}
              color={analise.liquido < 0 ? "var(--destructive)" : "var(--primary)"}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Bate com ENCARGOS FINANCEIROS LÍQUIDOS do Balancete.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Variação vs safra anterior
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`num text-2xl font-semibold ${
                analise.variacao === null
                  ? "text-muted-foreground"
                  : analise.variacao >= 0
                    ? "text-primary"
                    : "text-destructive"
              }`}
            >
              {analise.variacao === null
                ? "—"
                : `${analise.variacao >= 0 ? "+" : ""}${analise.variacao.toFixed(1)}%`}
            </p>
            <Sparkline
              data={analise.sparkVariacao}
              color={
                analise.variacao !== null && analise.variacao < 0
                  ? "var(--destructive)"
                  : "var(--primary)"
              }
            />
          </CardContent>
        </Card>
      </div>

      <SecaoFinanceira
        titulo="Despesas Financeiras"
        subtitulo="Cada natureza (Juros, IOF, Tarifas, Variação Cambial...) até o Total Despesas Financeiras — inclui os ajustes gerenciais lançados no Balancete, então o total bate com a linha DESPESAS FINANCEIRAS de lá. Clique numa barra para ver os lançamentos."
        cascata={analise.cascataDesp}
        itens={analise.itensDesp}
        massaTotal={analise.massaDesp}
        semDados={semDados}
        cor="var(--destructive)"
        onBarClick={abrirDetalhe}
        onRowClick={(i) => setDetalhe({ categoria: i.categoria, nomeconta: i.nomeconta })}
      />

      <SecaoFinanceira
        titulo="Receitas Financeiras"
        subtitulo="Cada natureza (Rendimentos, Descontos obtidos, Variação Cambial ativa...) até o Total Receitas Financeiras — inclui os ajustes gerenciais lançados no Balancete, então o total bate com a linha RECEITAS FINANCEIRAS de lá. Clique numa barra para ver os lançamentos."
        cascata={analise.cascataRec}
        itens={analise.itensRec}
        massaTotal={analise.massaRec}
        semDados={semDados}
        cor="var(--primary)"
        onBarClick={abrirDetalhe}
        onRowClick={(i) => setDetalhe({ categoria: i.categoria, nomeconta: i.nomeconta })}
      />

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução mensal</CardTitle>
          <p className="text-xs text-muted-foreground">
            Receitas acima da linha zero, Despesas abaixo — Líquido traçado por cima, mês a mês.
          </p>
        </CardHeader>
        <CardContent className="h-72">
          {semDados ? (
            <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analise.mensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="Receitas"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="Despesas"
                  stroke="var(--destructive)"
                  fill="var(--destructive)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="Líquido"
                  stroke="var(--chart-3)"
                  dot={false}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detalhe?.categoria} · {detalhe?.nomeconta} · safra {safraLabel(safraAtual)}
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
                {detalheFiltrado.map((r) => (
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
                {!detalheFiltrado.length && (
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
            Total: {formatBRL(detalheFiltrado.reduce((a, r) => a + Number(r.vlcusto), 0))}
          </p>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/** Cascata + ranking de uma categoria (Receitas ou Despesas Financeiras). */
function SecaoFinanceira({
  titulo,
  subtitulo,
  cascata,
  itens,
  massaTotal,
  semDados,
  cor,
  onBarClick,
  onRowClick,
}: {
  titulo: string;
  subtitulo: ReactNode;
  cascata: Passo[];
  itens: Item[];
  massaTotal: number;
  semDados: boolean;
  cor: string;
  onBarClick: (s: { especial?: boolean; categoria?: string; nomeconta?: string }) => void;
  onRowClick: (i: Item) => void;
}) {
  const marcadores = cascata.filter((s) => s.anteriorY != null);

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: cor }} />
            Este ano
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-muted-foreground" />
            Safra anterior
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-80 lg:col-span-2">
            {semDados ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento nesta categoria no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cascata} margin={{ top: 16, right: 8, left: 0, bottom: 70 }}>
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
                      const p = payload[0].payload as Passo;
                      const variacaoNat =
                        p.anterior != null && !p.total ? p.valor - p.anterior : null;
                      return (
                        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{p.nome}</p>
                          <p className="num mt-1">Este ano: {formatBRL(p.valor)}</p>
                          {p.anterior != null && (
                            <>
                              <p className="num text-muted-foreground">
                                Safra anterior: {formatBRL(p.anterior)}
                              </p>
                              <p className="num">Variação: {formatBRL(variacaoNat ?? 0)}</p>
                            </>
                          )}
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
                    onClick={(d: unknown) =>
                      onBarClick(
                        (
                          d as {
                            payload: { especial?: boolean; categoria?: string; nomeconta?: string };
                          }
                        ).payload,
                      )
                    }
                  >
                    {cascata.map((s, i) => (
                      <Cell
                        key={i}
                        fill={
                          s.total
                            ? "var(--chart-3)"
                            : s.valor >= 0
                              ? "var(--primary)"
                              : "var(--destructive)"
                        }
                        cursor={s.especial ? "default" : "pointer"}
                      />
                    ))}
                  </Bar>
                  <Scatter
                    data={marcadores}
                    dataKey="anteriorY"
                    shape={MarcadorAnterior}
                    legendType="none"
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="h-80">
            {semDados ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento nesta categoria no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={itens}
                  layout="vertical"
                  margin={{ top: 4, right: 62, left: 62, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    hide
                    domain={[
                      (dataMin: number) => (dataMin < 0 ? dataMin * 1.15 : 0),
                      (dataMax: number) => (dataMax > 0 ? dataMax * 1.15 : 0),
                    ]}
                  />
                  <YAxis
                    type="category"
                    dataKey="nomeconta"
                    width={104}
                    tick={{ fontSize: 10.5 }}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as Item;
                      const pct = massaTotal ? (Math.abs(p.valor) / massaTotal) * 100 : 0;
                      return (
                        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{p.nomeconta}</p>
                          <p className="num mt-1">
                            {formatBRL(p.valor)} · {pct.toFixed(1)}%
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="valor"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                    onClick={(d: unknown) => onRowClick((d as { payload: Item }).payload)}
                    cursor="pointer"
                  >
                    {itens.map((_, i) => (
                      <Cell key={i} fill={cor} />
                    ))}
                    <LabelList dataKey="valor" content={RotuloBarraRanking} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
