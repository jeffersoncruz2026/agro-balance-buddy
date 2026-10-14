import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/balancete";
import {
  cascataDRE,
  indicadoresBP,
  indicadoresDRE,
  montarBP,
  montarDRE,
  variacaoPercentual,
  type BpCalc,
  type LinhaValor,
  type ParValor,
  type PassoCascata,
} from "@/lib/bpdre";
import { formatCompacto, formatNum, formatPct, formatPP } from "@/lib/performance";
import { AlertTriangle, CheckCircle2, Download, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import logoGrupo from "@/assets/logo-grupo.png.asset.json";

type Aba = "geral" | "bp" | "dre";

const TITULO_ABA: Record<Aba, string> = {
  geral: "Visão Executiva",
  bp: "Balanço Patrimonial",
  dre: "Demonstração de Resultado",
};

export const Route = createFileRoute("/_authenticated/bp-dre")({
  head: () => ({
    meta: [
      { title: "Balanço Patrimonial e DRE | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Balanço Patrimonial e Demonstração de Resultado contábeis, por empresa ou consolidado.",
      },
      { property: "og:title", content: "Balanço Patrimonial e DRE | Balancete Gerencial" },
      { property: "og:description", content: "BP e DRE contábeis com comparação ano a ano." },
    ],
  }),
  component: BpDre,
});

const MESES_LABEL = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function BpDre() {
  const [empresaId, setEmpresaId] = useState<string>("");
  const [aba, setAba] = useState<Aba>("geral");
  const [periodo, setPeriodo] = useState<string>("");

  const [detalhe, setDetalhe] = useState<{
    demonstrativo: string;
    secao: string | null;
    linha: string;
  } | null>(null);

  const empresas = useQuery({
    queryKey: ["bp_dre_empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bp_dre_empresas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const periodos = useQuery({
    queryKey: ["bp_dre_periodos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bp_dre_periodos", {
        p_empresa_id: empresaId || undefined,
      });
      if (error) throw error;
      return data;
    },
  });

  const periodoAtual = useMemo(() => {
    if (periodo) return periodo;
    const p = periodos.data?.[0];
    return p ? `${p.ano}-${p.mes}` : "";
  }, [periodo, periodos.data]);

  const [anoSel, mesSel] = periodoAtual ? periodoAtual.split("-").map(Number) : [null, null];

  const relatorio = useQuery({
    queryKey: ["bp_dre_relatorio", empresaId, anoSel, mesSel],
    enabled: !!anoSel && !!mesSel,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bp_dre_relatorio", {
        p_empresa_id: empresaId || undefined,
        p_ano: anoSel!,
        p_mes: mesSel!,
      });
      if (error) throw error;
      return (data ?? []) as LinhaValor[];
    },
  });

  const linhas = useMemo(() => relatorio.data ?? [], [relatorio.data]);
  const bp = useMemo(() => montarBP(linhas), [linhas]);
  const dre = useMemo(() => montarDRE(linhas), [linhas]);
  const indDRE = useMemo(() => indicadoresDRE(dre), [dre]);
  const indBP = useMemo(() => indicadoresBP(bp, dre), [bp, dre]);
  const cascata = useMemo(() => cascataDRE(dre), [dre]);
  const receitaLiquida = indDRE.receitaLiquida;

  const detalheQuery = useQuery({
    queryKey: ["bp_dre_lancamentos_detalhe", empresaId, anoSel, mesSel, detalhe],
    enabled: !!detalhe && !!anoSel && !!mesSel,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bp_dre_lancamentos_detalhe", {
        p_empresa_id: empresaId || undefined,
        p_ano: anoSel!,
        p_mes: mesSel!,
        p_demonstrativo: detalhe!.demonstrativo,
        p_secao: detalhe!.secao ?? undefined,
        p_linha: detalhe!.linha,
      });
      if (error) throw error;
      return data;
    },
  });

  const detalheOrdenado = useMemo(
    () =>
      (detalheQuery.data ?? [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.saldo_atual)) - Math.abs(Number(a.saldo_atual))),
    [detalheQuery.data],
  );

  const secoesAtivo = useMemo(() => bp.secoes.filter((s) => s.lado === "ativo"), [bp.secoes]);
  const secoesPassivo = useMemo(() => bp.secoes.filter((s) => s.lado === "passivo"), [bp.secoes]);
  const contarLinhas = (secoes: typeof bp.secoes) =>
    secoes.reduce((acc, s) => acc + s.linhas.length + 1, 0);
  const linhasAtivo = contarLinhas(secoesAtivo);
  const linhasPassivo = contarLinhas(secoesPassivo);

  const empresaSelecionada = (empresas.data ?? []).find((e) => e.id === empresaId);
  const mesLabel = mesSel ? MESES_LABEL[mesSel - 1] : "";

  return (
    <AppLayout
      ocultarCabecalhoImpressao
      titulo="Balanço Patrimonial e DRE"
      descricao="Demonstrativos contábeis por empresa ou consolidado — linhas e subtotais sempre recalculados a partir do De/Para."
      acoes={
        <Button variant="outline" onClick={() => window.print()}>
          <Download className="size-4" /> Exportar PDF
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3 print:hidden">
        <div className="min-w-56">
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select
            value={empresaId || "consolidado"}
            onValueChange={(v) => {
              setEmpresaId(v === "consolidado" ? "" : v);
              setPeriodo("");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="consolidado">Consolidado (todas as empresas)</SelectItem>
              {(empresas.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44">
          <label className="text-xs text-muted-foreground">Período</label>
          <Select value={periodoAtual || undefined} onValueChange={setPeriodo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar período" />
            </SelectTrigger>
            <SelectContent>
              {(periodos.data ?? []).map((p) => (
                <SelectItem key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>
                  {MESES_LABEL[p.mes - 1]}/{p.ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!periodos.data?.length && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhum período importado ainda — envie um Balancete Contábil em "Importar Balancete
          Contábil".
        </p>
      )}

      <style>{`@media print { @page { size: A4 ${aba === "dre" ? "portrait" : "landscape"}; margin: 10mm; } }`}</style>

      {!!periodoAtual && (
        <div className="mt-6 hidden print:block">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="font-display text-lg font-semibold">
                {empresaSelecionada?.nome ?? "Consolidado (todas as empresas)"}
              </h2>
              <p className="text-sm">{TITULO_ABA[aba]}</p>
              <p className="mt-1 text-sm font-semibold">
                {mesLabel}-{anoSel}
              </p>
              <p className="mt-1 text-xs italic text-muted-foreground">(Em Reais)</p>
            </div>
            <img
              src={logoGrupo.url}
              alt="Grupo Otávio Lage"
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>
      )}

      {!!periodoAtual && (
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="mt-6 print-compact">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <TabsList>
              <TabsTrigger value="geral">Visão Geral</TabsTrigger>
              <TabsTrigger value="bp">Balanço Patrimonial</TabsTrigger>
              <TabsTrigger value="dre">DRE</TabsTrigger>
            </TabsList>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-3 py-1 font-medium">
                {empresaSelecionada?.nome ?? "Consolidado"}
              </span>
              <span className="rounded-full bg-muted px-3 py-1">
                {mesLabel}/{anoSel} <span className="text-muted-foreground">vs</span> {mesLabel}/
                {anoSel != null ? anoSel - 1 : ""}
              </span>
              {bp.consistente ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                  <CheckCircle2 className="size-3.5" /> Ativo = Passivo + PL
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">
                  <AlertTriangle className="size-3.5" /> Balanço não fecha
                </span>
              )}
            </div>
          </div>
          <TabsContent value="geral" className="mt-4">
            <VisaoGeral
              indDRE={indDRE}
              indBP={indBP}
              cascata={cascata}
              bp={bp}
              periodo={`${mesLabel}/${anoSel != null ? anoSel - 1 : ""}`}
            />
          </TabsContent>
          <TabsContent value="bp" className="mt-4">
            {!bp.consistente && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Total do Ativo ({formatBRL(bp.totalAtivo)}) não bate com Total do Passivo + PL (
                  {formatBRL(bp.totalPassivo)}). Confira o De/Para — pode haver conta sem mapeamento
                  ou mapeada duas vezes.
                </span>
              </div>
            )}
            <div className="grid items-start gap-4 2xl:grid-cols-2 print:grid-cols-2 print:gap-6">
              <BpColuna
                titulo="Ativo"
                secoes={secoesAtivo}
                total="Total do ativo"
                totalValor={bp.totalAtivo}
                totalValorAnoAnterior={bp.totalAtivoAnoAnterior}
                baseAV={bp.totalAtivo}
                mesLabel={mesLabel}
                anoSel={anoSel}
                demonstrativo="BP"
                onDetalhe={setDetalhe}
                linhasVazias={Math.max(0, linhasPassivo - linhasAtivo)}
              />
              <BpColuna
                titulo="Passivo"
                secoes={secoesPassivo}
                total="Total do passivo + PL"
                totalValor={bp.totalPassivo}
                totalValorAnoAnterior={bp.totalPassivoAnoAnterior}
                baseAV={bp.totalAtivo}
                mesLabel={mesLabel}
                anoSel={anoSel}
                demonstrativo="BP"
                onDetalhe={setDetalhe}
                linhasVazias={Math.max(0, linhasAtivo - linhasPassivo)}
              />
            </div>
          </TabsContent>
          <TabsContent value="dre" className="mt-4">
            <Card className="print:border-0 print:bg-transparent print:shadow-none">
              <CardContent className="pt-6 print:p-0">
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[680px] print:min-w-0 text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="sticky left-0 bg-card pb-2 text-left font-medium print:static print:bg-transparent" />
                        <th className="pb-2 text-right font-medium">
                          {mesLabel}/{anoSel}
                        </th>
                        <th className="pb-2 text-right font-medium print:hidden">AV%</th>
                        <th className="hidden pb-2 text-right font-medium print:table-cell">Δ</th>
                        <th className="pb-2 text-right font-medium">
                          {mesLabel}/{anoSel != null ? anoSel - 1 : ""}
                        </th>
                        <th className="pb-2 text-right font-medium print:hidden">Δ R$</th>
                        <th className="pb-2 pr-2 text-right font-medium print:hidden">Δ%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dre
                        .filter((l) => !(l.tipo === "linha" && l.semDados))
                        .map((l) => {
                          const fundo = l.tipo === "subtotal" ? "bg-muted" : "";
                          return (
                            <tr
                              key={l.chave}
                              className={`border-t border-border ${l.tipo === "subtotal" ? "font-semibold" : ""} ${l.destaque ? "text-base" : ""} ${fundo}`}
                            >
                              <td
                                className={`sticky left-0 py-1.5 print:static ${l.tipo === "linha" ? "pl-5" : "pl-2"} ${fundo ? "bg-muted" : "bg-card"} print:bg-transparent`}
                              >
                                {l.rotulo}
                              </td>
                              <td
                                className={`num py-1.5 text-right ${l.destaque ? (l.valor < 0 ? "text-destructive" : "text-primary") : ""}`}
                              >
                                {l.tipo === "linha" ? (
                                  <button
                                    className="hover:underline"
                                    onClick={() =>
                                      setDetalhe({
                                        demonstrativo: "DRE",
                                        secao: null,
                                        linha: l.rotulo,
                                      })
                                    }
                                  >
                                    {formatBRL(l.valor)}
                                  </button>
                                ) : (
                                  formatBRL(l.valor)
                                )}
                              </td>
                              <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground print:hidden">
                                {receitaLiquida.atual
                                  ? formatPct((l.valor / receitaLiquida.atual) * 100, 1)
                                  : "—"}
                              </td>
                              <td className="num hidden whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:table-cell">
                                <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} />
                              </td>
                              <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground">
                                {formatBRL(l.valorAnoAnterior)}
                              </td>
                              <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:hidden">
                                {formatBRL(l.valor - l.valorAnoAnterior)}
                              </td>
                              <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 pr-2 text-right print:hidden">
                                <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!!periodoAtual && aba !== "geral" && (
        <p className="mt-3 hidden border-t border-border pt-1 text-[9pt] print:block">
          {aba === "bp"
            ? "As notas explicativas são parte integrante das demonstrações financeiras"
            : "* As Demonstrações Financeiras poderão sofrer alterações, se ocorrerem ajustes nos balanços de nossas controladas e/ou por solicitação de seus auditores."}
        </p>
      )}

      {empresaSelecionada &&
        aba !== "geral" &&
        (empresaSelecionada.rodape_texto || empresaSelecionada.responsavel_nome) && (
          <div className="mt-8 hidden print:block">
            {empresaSelecionada.rodape_texto && (
              <p className="text-xs text-muted-foreground">{empresaSelecionada.rodape_texto}</p>
            )}
            <div className="mt-10 flex justify-around text-center text-xs">
              {empresaSelecionada.responsavel_nome && (
                <div>
                  <p className="border-t border-foreground px-8 pt-1 font-medium">
                    {empresaSelecionada.responsavel_nome}
                  </p>
                  {empresaSelecionada.responsavel_documento && (
                    <p>{empresaSelecionada.responsavel_documento}</p>
                  )}
                  <p>Diretor</p>
                </div>
              )}
              {empresaSelecionada.contador_nome && (
                <div>
                  <p className="border-t border-foreground px-8 pt-1 font-medium">
                    {empresaSelecionada.contador_nome}
                  </p>
                  {empresaSelecionada.contador_documento && (
                    <p>{empresaSelecionada.contador_documento}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalhe?.linha}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Conta</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo Atual</th>
                </tr>
              </thead>
              <tbody>
                {detalheOrdenado.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{d.conta}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{d.descricao}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {formatBRL(Number(d.saldo_atual))}
                    </td>
                  </tr>
                ))}
                {!detalheOrdenado.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum lançamento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/* ============================ Visão Geral ============================ */

function VisaoGeral({
  indDRE,
  indBP,
  cascata,
  bp,
  periodo,
}: {
  indDRE: ReturnType<typeof indicadoresDRE>;
  indBP: ReturnType<typeof indicadoresBP>;
  cascata: PassoCascata[];
  bp: BpCalc;
  /** Rótulo do período de comparação (mesmo mês do ano anterior). */
  periodo: string;
}) {
  const dadosCascata = useMemo(() => {
    let acumulado = 0;
    return cascata.map((p) => {
      if (p.subtotal) {
        acumulado = p.valor;
        return {
          rotulo: p.rotulo,
          base: Math.min(0, p.valor),
          barra: Math.abs(p.valor),
          valor: p.valor,
          tipo: "subtotal",
        };
      }
      const inicio = acumulado;
      acumulado += p.valor;
      return {
        rotulo: p.rotulo,
        base: Math.min(inicio, acumulado),
        barra: Math.abs(p.valor),
        valor: p.valor,
        tipo: p.valor >= 0 ? "aumento" : "reducao",
      };
    });
  }, [cascata]);

  const estrutura = useMemo(() => {
    const sec = (c: string) => bp.secoes.find((s) => s.chave === c)?.subtotal ?? 0;
    return [
      {
        lado: "Ativo",
        ac: sec("ATIVO_CIRCULANTE"),
        anc: sec("ATIVO_NAO_CIRCULANTE"),
        pc: 0,
        pnc: 0,
        pl: 0,
      },
      {
        lado: "Passivo + PL",
        ac: 0,
        anc: 0,
        pc: sec("PASSIVO_CIRCULANTE"),
        pnc: sec("PASSIVO_NAO_CIRCULANTE"),
        pl: sec("PATRIMONIO_LIQUIDO"),
      },
    ];
  }, [bp.secoes]);
  const pctAtivo = (v: number) =>
    bp.totalAtivo ? `${formatNum((v / bp.totalAtivo) * 100, 0)}%` : "";

  const corPasso = (tipo: string, valor: number) =>
    tipo === "subtotal"
      ? valor < 0
        ? "var(--destructive)"
        : "var(--primary)"
      : tipo === "aumento"
        ? "var(--chart-3)"
        : "var(--chart-2)";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Receita líquida" par={indDRE.receitaLiquida} moeda />
        <KpiCard
          titulo="Lucro bruto"
          par={indDRE.lucroBruto}
          moeda
          margem={indDRE.margemBruta}
          rotuloMargem="margem bruta"
        />
        <KpiCard
          titulo="Resultado operacional"
          par={indDRE.resultadoOperacional}
          moeda
          margem={indDRE.margemOperacional}
          rotuloMargem="margem operacional"
        />
        <KpiCard
          titulo="Lucro líquido"
          par={indDRE.lucroLiquido}
          moeda
          margem={indDRE.margemLiquida}
          rotuloMargem="margem líquida"
          destaque
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saúde financeira</CardTitle>
          <p className="text-xs text-muted-foreground">Comparado com {periodo}.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <IndicadorPatrimonial
            rotulo="Liquidez corrente"
            ajuda="Ativo circ. ÷ Passivo circ."
            par={indBP.liquidezCorrente}
            fmt={(v) => formatNum(v, 2)}
            maiorMelhor
          />
          <IndicadorPatrimonial
            rotulo="Capital circulante líquido"
            ajuda="Ativo circ. − Passivo circ."
            par={indBP.capitalCirculanteLiquido}
            fmt={formatCompacto}
            maiorMelhor
          />
          <IndicadorPatrimonial
            rotulo="Endividamento geral"
            ajuda="(PC + PNC) ÷ Ativo total"
            par={indBP.endividamentoGeral}
            fmt={(v) => formatPct(v, 1)}
            pp
          />
          <IndicadorPatrimonial
            rotulo="Patrimônio líquido"
            par={indBP.patrimonioLiquido}
            fmt={formatCompacto}
            maiorMelhor
          />
          <IndicadorPatrimonial
            rotulo="ROE do período"
            ajuda="Lucro líquido ÷ PL"
            par={indBP.roe}
            fmt={(v) => formatPct(v, 1)}
            maiorMelhor
            pp
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3 print:grid-cols-3">
        <Card className="xl:col-span-2 print:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Da receita ao lucro</CardTitle>
            <p className="text-xs text-muted-foreground">
              Como a receita líquida se transforma em lucro líquido no período.
            </p>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosCascata} margin={{ top: 28, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  fontSize={10}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v: number) => formatCompacto(v).replace("R$ ", "")}
                  width={60}
                />
                <Tooltip
                  formatter={(_v, _n, item) =>
                    formatBRL((item?.payload as { valor: number }).valor)
                  }
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="base" stackId="c" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="barra" stackId="c" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                  {dadosCascata.map((d) => (
                    <Cell key={d.rotulo} fill={corPasso(d.tipo, d.valor)} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    fontSize={10}
                    formatter={(v: number) => formatCompacto(v).replace("R$ ", "")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Estrutura do balanço</CardTitle>
            <p className="text-xs text-muted-foreground">Composição sobre o total do ativo.</p>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={estrutura} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="lado" fontSize={11} />
                <YAxis hide />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                <Tooltip
                  formatter={(v: number, n: string) => [`${formatBRL(v)} (${pctAtivo(v)})`, n]}
                />
                {(
                  [
                    ["ac", "Ativo circulante", "var(--chart-1)"],
                    ["anc", "Ativo não circulante", "var(--chart-3)"],
                    ["pc", "Passivo circulante", "var(--chart-2)"],
                    ["pnc", "Passivo não circulante", "var(--chart-4)"],
                    ["pl", "Patrimônio líquido", "var(--chart-5)"],
                  ] as const
                ).map(([k, nome, cor]) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={nome}
                    stackId="e"
                    fill={cor}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={k}
                      position="center"
                      fontSize={10}
                      fill="white"
                      formatter={(v: number) =>
                        v
                          ? `${nome
                              .split(" ")
                              .map((p) => p[0])
                              .join("")
                              .toUpperCase()} ${pctAtivo(v)}`
                          : ""
                      }
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  titulo,
  par,
  margem,
  rotuloMargem,
  destaque,
}: {
  titulo: string;
  par: ParValor;
  moeda?: boolean;
  margem?: ParValor;
  rotuloMargem?: string;
  destaque?: boolean;
}) {
  const atual = par.atual ?? 0;
  const v = par.anterior ? variacaoPercentual(atual, par.anterior ?? 0) : null;
  const bom = v === null ? null : v > 0;
  return (
    <Card className={destaque ? "border-primary/40" : ""}>
      <CardContent className="pt-4 sm:pt-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titulo}
        </p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? (atual < 0 ? "text-destructive" : "text-primary") : ""}`}
          title={formatBRL(atual)}
        >
          {formatCompacto(atual)}
        </p>
        {v !== null ? (
          <p
            className={`mt-1 flex items-center gap-1 text-xs ${bom ? "text-primary" : "text-destructive"}`}
          >
            {bom ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {v > 0 ? "+" : ""}
            {formatNum(v * 100, 1)}% vs. ano anterior
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">sem base de comparação</p>
        )}
        {margem && margem.atual !== null && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{formatPct(margem.atual, 1)}</span>{" "}
            {rotuloMargem}
            {margem.anterior !== null && (
              <span
                className={margem.atual >= margem.anterior ? "text-primary" : "text-destructive"}
              >
                {" "}
                ({formatPP(margem.atual - margem.anterior)})
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IndicadorPatrimonial({
  rotulo,
  ajuda,
  par,
  fmt,
  maiorMelhor,
  pp,
}: {
  rotulo: string;
  ajuda?: string;
  par: ParValor;
  fmt: (v: number) => string;
  /** Se um valor maior é favorável (ex.: liquidez); senão menor é melhor (ex.: endividamento). */
  maiorMelhor?: boolean;
  /** Variação em pontos percentuais (indicadores já em %). */
  pp?: boolean;
}) {
  const { atual, anterior } = par;
  let variacao: string | null = null;
  let bom: boolean | null = null;
  if (atual !== null && anterior !== null) {
    const diff = atual - anterior;
    bom = diff === 0 ? null : maiorMelhor ? diff > 0 : diff < 0;
    if (pp) variacao = formatPP(diff);
    else {
      const vp = variacaoPercentual(atual, anterior);
      variacao = vp === null ? null : `${vp > 0 ? "+" : ""}${formatNum(vp * 100, 1)}%`;
    }
  }
  return (
    <div className="min-w-0" title={ajuda}>
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{rotulo}</p>
      <p className="truncate text-lg font-semibold tabular-nums">
        {atual !== null ? fmt(atual) : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        ant. {anterior !== null ? fmt(anterior) : "—"}
        {variacao && (
          <span className={bom === null ? "" : bom ? "text-primary" : "text-destructive"}>
            {" "}
            · {variacao}
          </span>
        )}
      </p>
      {ajuda && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{ajuda}</p>}
    </div>
  );
}

function BpColuna({
  titulo,
  secoes,
  total,
  totalValor,
  totalValorAnoAnterior,
  baseAV,
  mesLabel,
  anoSel,
  demonstrativo,
  onDetalhe,
  linhasVazias = 0,
}: {
  titulo: string;
  secoes: BpCalc["secoes"];
  total: string;
  totalValor: number;
  totalValorAnoAnterior: number;
  /** Total do Ativo — base da análise vertical (AV%). */
  baseAV: number;
  mesLabel: string;
  anoSel: number | null;
  demonstrativo: string;
  onDetalhe: (v: { demonstrativo: string; secao: string | null; linha: string }) => void;
  /** Linhas em branco para alinhar o total desta coluna com o da coluna oposta. */
  linhasVazias?: number;
}) {
  const av = (v: number) => (baseAV ? formatPct((v / baseAV) * 100, 1) : "—");
  return (
    <Card className="print:border-0 print:bg-transparent print:shadow-none">
      <CardContent className="overflow-x-auto pt-4 sm:pt-6 print:overflow-visible print:p-0">
        <table className="w-full min-w-[600px] print:min-w-0 text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 text-left font-display text-sm font-semibold text-foreground">
                {titulo}
              </th>
              <th className="pb-2 text-right font-medium">
                {mesLabel}/{anoSel}
              </th>
              <th className="pb-2 text-right font-medium print:hidden">AV%</th>
              <th className="hidden pb-2 text-right font-medium print:table-cell">Δ</th>
              <th className="pb-2 text-right font-medium">
                {mesLabel}/{anoSel != null ? anoSel - 1 : ""}
              </th>
              <th className="pb-2 text-right font-medium print:hidden">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {secoes.map((s) => (
              <Fragment key={s.chave}>
                <tr className="border-t border-border print:hidden">
                  <td
                    colSpan={5}
                    className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-primary uppercase"
                  >
                    {s.rotulo}
                  </td>
                </tr>
                {s.linhas.map((l) => (
                  <tr key={`${s.chave}-${l.linha}`} className="border-t border-border">
                    <td className="py-1.5 pl-4">{l.linha}</td>
                    <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right">
                      <button
                        className="hover:underline"
                        onClick={() => onDetalhe({ demonstrativo, secao: s.chave, linha: l.linha })}
                      >
                        {formatBRL(l.valor)}
                      </button>
                    </td>
                    <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground print:hidden">
                      {av(l.valor)}
                    </td>
                    <td className="num hidden whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:table-cell">
                      <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} colorir={false} />
                    </td>
                    <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground">
                      {formatBRL(l.valorAnoAnterior)}
                    </td>
                    <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:hidden">
                      <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} colorir={false} />
                    </td>
                  </tr>
                ))}
                <tr
                  key={`${s.chave}-total`}
                  className="border-t border-border bg-muted/30 font-semibold"
                >
                  <td className="py-1.5 pl-2">{s.subtotalRotulo}</td>
                  <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right">
                    {formatBRL(s.subtotal)}
                  </td>
                  <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground print:hidden">
                    {av(s.subtotal)}
                  </td>
                  <td className="num hidden whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:table-cell">
                    <VariacaoPct
                      atual={s.subtotal}
                      anterior={s.subtotalAnoAnterior}
                      colorir={false}
                    />
                  </td>
                  <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right text-muted-foreground">
                    {formatBRL(s.subtotalAnoAnterior)}
                  </td>
                  <td className="num whitespace-nowrap pl-3 print:pl-1 py-1.5 text-right print:hidden">
                    <VariacaoPct
                      atual={s.subtotal}
                      anterior={s.subtotalAnoAnterior}
                      colorir={false}
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
            {Array.from({ length: linhasVazias }).map((_, i) => (
              <tr
                key={`vazia-${i}`}
                className="hidden border-t border-transparent 2xl:table-row print:table-row"
                aria-hidden
              >
                <td className="py-1.5 pl-4">&nbsp;</td>
                <td />
                <td className="print:hidden" />
                <td className="hidden print:table-cell" />
                <td />
                <td className="print:hidden" />
              </tr>
            ))}
            <tr className="border-t-2 border-foreground/40 bg-muted/60 font-semibold">
              <td className="py-2 pl-2">{total}</td>
              <td className="num whitespace-nowrap pl-3 print:pl-1 py-2 text-right">
                {formatBRL(totalValor)}
              </td>
              <td className="num whitespace-nowrap pl-3 print:pl-1 py-2 text-right text-muted-foreground print:hidden">
                {av(totalValor)}
              </td>
              <td className="num hidden whitespace-nowrap pl-3 print:pl-1 py-2 text-right print:table-cell">
                <VariacaoPct atual={totalValor} anterior={totalValorAnoAnterior} colorir={false} />
              </td>
              <td className="num whitespace-nowrap pl-3 print:pl-1 py-2 text-right text-muted-foreground">
                {formatBRL(totalValorAnoAnterior)}
              </td>
              <td className="num whitespace-nowrap pl-3 print:pl-1 py-2 text-right print:hidden">
                <VariacaoPct atual={totalValor} anterior={totalValorAnoAnterior} colorir={false} />
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function VariacaoPct({
  atual,
  anterior,
  colorir = true,
}: {
  atual: number;
  anterior: number;
  /** No BP, Ativo x Passivo têm direções "favoráveis" opostas para uma mesma alta — melhor não colorir. */
  colorir?: boolean;
}) {
  const pct = variacaoPercentual(atual, anterior);
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const cor = !colorir
    ? ""
    : pct > 0
      ? "text-primary"
      : pct < 0
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cor}>
      {pct > 0 ? "+" : ""}
      {(pct * 100).toFixed(0)}%
    </span>
  );
}
