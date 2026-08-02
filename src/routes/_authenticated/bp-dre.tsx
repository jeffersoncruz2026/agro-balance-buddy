import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { montarBP, montarDRE, variacaoPercentual, type LinhaValor } from "@/lib/bpdre";
import { AlertTriangle, Download } from "lucide-react";

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

  const empresaSelecionada = (empresas.data ?? []).find((e) => e.id === empresaId);
  const mesLabel = mesSel ? MESES_LABEL[mesSel - 1] : "";

  return (
    <AppLayout
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

      {!!periodoAtual && (
        <div className="mt-6 hidden print:block">
          <h2 className="font-display text-lg font-semibold">
            {empresaSelecionada?.nome ?? "Consolidado (todas as empresas)"}
          </h2>
          <p className="text-sm text-muted-foreground">(Em Reais)</p>
        </div>
      )}

      {!!periodoAtual && (
        <Tabs defaultValue="bp" className="mt-6">
          <TabsList className="print:hidden">
            <TabsTrigger value="bp">Balanço Patrimonial</TabsTrigger>
            <TabsTrigger value="dre">DRE</TabsTrigger>
          </TabsList>
          <TabsContent value="bp" className="mt-4">
            <h3 className="mb-2 hidden text-base font-semibold print:block">
              Balanço Patrimonial — {mesLabel}/{anoSel}
            </h3>
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
            <div className="grid gap-4 lg:grid-cols-2">
              <BpColuna
                titulo="Ativo"
                secoes={bp.secoes.filter((s) => s.lado === "ativo")}
                total="Total do ativo"
                totalValor={bp.totalAtivo}
                totalValorAnoAnterior={bp.totalAtivoAnoAnterior}
                mesLabel={mesLabel}
                anoSel={anoSel}
                demonstrativo="BP"
                onDetalhe={setDetalhe}
              />
              <BpColuna
                titulo="Passivo"
                secoes={bp.secoes.filter((s) => s.lado === "passivo")}
                total="Total do passivo + PL"
                totalValor={bp.totalPassivo}
                totalValorAnoAnterior={bp.totalPassivoAnoAnterior}
                mesLabel={mesLabel}
                anoSel={anoSel}
                demonstrativo="BP"
                onDetalhe={setDetalhe}
              />
            </div>
          </TabsContent>
          <TabsContent value="dre" className="mt-4">
            <h3 className="mb-2 hidden text-base font-semibold print:block">
              Demonstração de Resultado — {mesLabel}/{anoSel}
            </h3>
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium"></th>
                      <th className="pb-2 text-right font-medium">
                        {mesLabel}/{anoSel}
                      </th>
                      <th className="pb-2 text-right font-medium">Δ</th>
                      <th className="pb-2 text-right font-medium">
                        {mesLabel}/{anoSel != null ? anoSel - 1 : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dre
                      .filter((l) => !(l.tipo === "linha" && l.semDados))
                      .map((l) => (
                        <tr
                          key={l.chave}
                          className={`border-t border-border ${l.tipo === "subtotal" ? "font-semibold" : ""} ${l.destaque ? "bg-muted/60 text-base" : ""}`}
                        >
                          <td className="py-1.5 pl-2">{l.rotulo}</td>
                          <td className="num py-1.5 text-right">
                            {l.tipo === "linha" ? (
                              <button
                                className="hover:underline"
                                onClick={() =>
                                  setDetalhe({ demonstrativo: "DRE", secao: null, linha: l.rotulo })
                                }
                              >
                                {formatBRL(l.valor)}
                              </button>
                            ) : (
                              formatBRL(l.valor)
                            )}
                          </td>
                          <td className="num py-1.5 text-right">
                            <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} />
                          </td>
                          <td className="num py-1.5 pr-2 text-right text-muted-foreground">
                            {formatBRL(l.valorAnoAnterior)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {empresaSelecionada &&
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
                {(detalheQuery.data ?? []).map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{d.conta}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{d.descricao}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {formatBRL(Number(d.saldo_atual))}
                    </td>
                  </tr>
                ))}
                {!detalheQuery.data?.length && (
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

function BpColuna({
  titulo,
  secoes,
  total,
  totalValor,
  totalValorAnoAnterior,
  mesLabel,
  anoSel,
  demonstrativo,
  onDetalhe,
}: {
  titulo: string;
  secoes: ReturnType<typeof montarBP>["secoes"];
  total: string;
  totalValor: number;
  totalValorAnoAnterior: number;
  mesLabel: string;
  anoSel: number | null;
  demonstrativo: string;
  onDetalhe: (v: { demonstrativo: string; secao: string | null; linha: string }) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 text-left font-medium">{titulo}</th>
              <th className="pb-2 text-right font-medium">
                {mesLabel}/{anoSel}
              </th>
              <th className="pb-2 text-right font-medium">Δ</th>
              <th className="pb-2 text-right font-medium">
                {mesLabel}/{anoSel != null ? anoSel - 1 : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {secoes.map((s) => (
              <Fragment key={s.chave}>
                {s.linhas.map((l) => (
                  <tr key={`${s.chave}-${l.linha}`} className="border-t border-border">
                    <td className="py-1.5 pl-4">{l.linha}</td>
                    <td className="num py-1.5 text-right">
                      <button
                        className="hover:underline"
                        onClick={() => onDetalhe({ demonstrativo, secao: s.chave, linha: l.linha })}
                      >
                        {formatBRL(l.valor)}
                      </button>
                    </td>
                    <td className="num py-1.5 text-right">
                      <VariacaoPct atual={l.valor} anterior={l.valorAnoAnterior} colorir={false} />
                    </td>
                    <td className="num py-1.5 text-right text-muted-foreground">
                      {formatBRL(l.valorAnoAnterior)}
                    </td>
                  </tr>
                ))}
                <tr key={`${s.chave}-total`} className="border-t border-border font-semibold">
                  <td className="py-1.5 pl-2">{s.subtotalRotulo}</td>
                  <td className="num py-1.5 text-right">{formatBRL(s.subtotal)}</td>
                  <td className="num py-1.5 text-right">
                    <VariacaoPct
                      atual={s.subtotal}
                      anterior={s.subtotalAnoAnterior}
                      colorir={false}
                    />
                  </td>
                  <td className="num py-1.5 text-right text-muted-foreground">
                    {formatBRL(s.subtotalAnoAnterior)}
                  </td>
                </tr>
              </Fragment>
            ))}
            <tr className="border-t-2 border-foreground/40 bg-muted/60 font-semibold">
              <td className="py-2 pl-2">{total}</td>
              <td className="num py-2 text-right">{formatBRL(totalValor)}</td>
              <td className="num py-2 text-right">
                <VariacaoPct atual={totalValor} anterior={totalValorAnoAnterior} colorir={false} />
              </td>
              <td className="num py-2 text-right text-muted-foreground">
                {formatBRL(totalValorAnoAnterior)}
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
