import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/resultado-financeiro")({
  head: () => ({
    meta: [
      { title: "Abertura Resultado Financeiro | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Composição do resultado financeiro por natureza da conta, evolução mensal e comparativo entre safras.",
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

const CAT_DESP = "DESPESAS FINANCEIRAS";
const CAT_REC = "RECEITAS FINANCEIRAS";

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

  const somaCat = (rows: Linha[], ajustes: Ajuste[], cat: string) =>
    rows.filter((r) => r.categoria === cat).reduce((a, r) => a + Number(r.valor), 0) +
    ajustes.filter((a) => a.categoria === cat).reduce((a, r) => a + Number(r.valor), 0);

  const analise = useMemo(() => {
    const rows = (rfQ.data ?? []).filter((r) => mesesSel.includes(r.mes));
    const rowsAnt = (rfAntQ.data ?? []).filter((r) => mesesSel.includes(r.mes));
    const ajustesAtual = (ajustesQ.data ?? []).filter(
      (a) => a.safra_ano === safraAtual && mesesSel.includes(a.mes),
    );
    const ajustesAnt = (ajustesQ.data ?? []).filter(
      (a) => a.safra_ano === safraAtual - 1 && mesesSel.includes(a.mes),
    );

    const receitas = somaCat(rows, ajustesAtual, CAT_REC);
    const despesas = somaCat(rows, ajustesAtual, CAT_DESP);
    const liquido = receitas + despesas;

    const receitasAnt = somaCat(rowsAnt, ajustesAnt, CAT_REC);
    const despesasAnt = somaCat(rowsAnt, ajustesAnt, CAT_DESP);
    const liquidoAnt = receitasAnt + despesasAnt;
    const variacao =
      liquidoAnt !== 0 ? ((liquido - liquidoAnt) / Math.abs(liquidoAnt)) * 100 : null;

    // Abertura por natureza (nomeconta), somando os meses selecionados.
    const porNatureza = new Map<string, { categoria: string; nomeconta: string; valor: number }>();
    for (const r of rows) {
      const k = `${r.categoria}|${r.nomeconta}`;
      const at = porNatureza.get(k);
      if (at) at.valor += Number(r.valor);
      else
        porNatureza.set(k, {
          categoria: r.categoria,
          nomeconta: r.nomeconta,
          valor: Number(r.valor),
        });
    }
    const itens = [...porNatureza.values()]
      .filter((i) => Math.abs(i.valor) >= 0.005)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

    const massaTotal = itens.reduce((a, i) => a + Math.abs(i.valor), 0);

    const TOP_N = 8;
    const top = itens.slice(0, TOP_N);
    const outrasValor = itens.slice(TOP_N).reduce((a, i) => a + i.valor, 0);
    const ajusteValor = ajustesAtual.reduce((a, r) => a + Number(r.valor), 0);

    type Step = {
      nome: string;
      valor: number;
      categoria?: string;
      nomeconta?: string;
      especial?: boolean;
    };
    const steps: Step[] = [
      ...top.map((i) => ({
        nome: i.nomeconta,
        valor: i.valor,
        categoria: i.categoria,
        nomeconta: i.nomeconta,
      })),
      ...(Math.abs(outrasValor) >= 0.005
        ? [{ nome: "Outras contas", valor: outrasValor, especial: true }]
        : []),
      ...(Math.abs(ajusteValor) >= 0.005
        ? [{ nome: "Ajustes gerenciais", valor: ajusteValor, especial: true }]
        : []),
    ];

    let running = 0;
    const waterfall = steps.map((s) => {
      const antes = running;
      const depois = running + s.valor;
      running = depois;
      return { ...s, base: Math.min(antes, depois), delta: Math.abs(s.valor) };
    });
    waterfall.push({
      nome: "Resultado Financeiro Líquido",
      valor: running,
      especial: true,
      total: true,
      base: Math.min(0, running),
      delta: Math.abs(running),
    } as (typeof waterfall)[number] & { total: boolean });

    // Evolução mensal, restrita aos meses selecionados (ordem da safra).
    const mensal = mesesOrdem
      .filter((m) => mesesSel.includes(m))
      .map((m) => {
        const doMes = rows.filter((r) => r.mes === m);
        const rec = doMes
          .filter((r) => r.categoria === CAT_REC)
          .reduce((a, r) => a + Number(r.valor), 0);
        const desp = doMes
          .filter((r) => r.categoria === CAT_DESP)
          .reduce((a, r) => a + Number(r.valor), 0);
        const ano = doMes[0]?.ano ?? anoCivil(m, safraAtual);
        return {
          periodo: `${MESES[m - 1].slice(0, 3)}/${String(ano).slice(2)}`,
          Receitas: rec,
          Despesas: desp,
          Líquido: rec + desp,
        };
      });

    return { receitas, despesas, liquido, variacao, itens, massaTotal, waterfall, mensal };
  }, [rfQ.data, rfAntQ.data, ajustesQ.data, safraAtual, mesesOrdem, mesesSel, inicioSafra]);

  const carregando = rfQ.isLoading || rfAntQ.isLoading;
  const semDados = !carregando && !erro && analise.itens.length === 0;

  const abrirDetalhe = (s: { especial?: boolean; categoria?: string; nomeconta?: string }) => {
    if (s.especial || !s.categoria || !s.nomeconta) return;
    setDetalhe({ categoria: s.categoria, nomeconta: s.nomeconta });
  };

  return (
    <AppLayout
      titulo="Abertura Resultado Financeiro"
      descricao={`O que está compondo o resultado financeiro — ${periodoLabel} · safra ${safraLabel(safraAtual)} vs ${safraLabel(safraAtual - 1)}`}
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
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Composição do resultado, por natureza da conta
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Receitas e despesas financeiras do período selecionado, uma barra por conta, até o
            Resultado Financeiro Líquido. Clique numa barra para ver os lançamentos.
          </p>
        </CardHeader>
        <CardContent className="h-96">
          {semDados ? (
            <p className="text-sm text-muted-foreground">
              Nenhum lançamento financeiro neste período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analise.waterfall}
                margin={{ top: 16, right: 16, left: 0, bottom: 70 }}
              >
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
                  onClick={(d: unknown) =>
                    abrirDetalhe(
                      (
                        d as {
                          payload: { especial?: boolean; categoria?: string; nomeconta?: string };
                        }
                      ).payload,
                    )
                  }
                >
                  {analise.waterfall.map((s, i) => (
                    <Cell
                      key={i}
                      fill={
                        (s as { total?: boolean }).total
                          ? "var(--chart-3)"
                          : s.valor >= 0
                            ? "var(--primary)"
                            : "var(--destructive)"
                      }
                      cursor={s.especial ? "default" : "pointer"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução mensal</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {semDados ? (
              <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analise.mensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="Receitas"
                    stroke="var(--primary)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Despesas"
                    stroke="var(--destructive)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Líquido"
                    stroke="var(--chart-3)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Maiores contribuintes (natureza)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ordenado pelo peso no total movimentado em Receitas/Despesas Financeiras.
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Natureza</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {analise.itens.map((i) => {
                    const pct = analise.massaTotal
                      ? (Math.abs(i.valor) / analise.massaTotal) * 100
                      : 0;
                    return (
                      <tr
                        key={`${i.categoria}|${i.nomeconta}`}
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                        onClick={() =>
                          setDetalhe({ categoria: i.categoria, nomeconta: i.nomeconta })
                        }
                      >
                        <td className="relative px-2 py-1.5">
                          <div
                            className={`absolute inset-y-0 left-0 ${i.valor >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                          <span className="relative">{i.nomeconta}</span>
                        </td>
                        <td
                          className={`num relative px-2 py-1.5 text-right ${i.valor < 0 ? "text-destructive" : ""}`}
                        >
                          {formatBRL(i.valor)}
                        </td>
                        <td className="num relative px-2 py-1.5 text-right text-muted-foreground">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  {!analise.itens.length && (
                    <tr>
                      <td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                        Nenhum lançamento financeiro neste período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

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
                  <th className="px-2 py-2 text-left font-medium">Depto</th>
                  <th className="px-2 py-2 text-left font-medium">Produto</th>
                  <th className="px-2 py-2 text-left font-medium">Conta</th>
                  <th className="px-2 py-2 text-left font-medium">Documento</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {detalheFiltrado.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="num px-2 py-1">
                      {new Date(r.data as string).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-2 py-1">{r.nomedepto}</td>
                    <td className="max-w-56 truncate px-2 py-1">{r.produto}</td>
                    <td className="px-2 py-1">{r.contacontabil}</td>
                    <td className="px-2 py-1">{r.documento}</td>
                    <td className="num px-2 py-1 text-right">{formatBRL(Number(r.vlcusto))}</td>
                  </tr>
                ))}
                {!detalheFiltrado.length && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">
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
