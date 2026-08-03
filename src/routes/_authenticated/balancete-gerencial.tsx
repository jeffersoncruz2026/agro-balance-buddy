import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
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
import {
  COLUNAS,
  LINHAS,
  MESES,
  formatBRL,
  montarRelatorio,
  safraDe,
  safraLabel,
  type AggRow,
  type Ajuste,
  type ColKey,
} from "@/lib/balancete";

import { exportarBalancete } from "@/lib/excel";
import { Download, FileDown, AlertTriangle } from "lucide-react";

/** Imprime só esta página em A4 paisagem, sem afetar o print das demais telas. */
function exportarPdfPaisagem() {
  const style = document.createElement("style");
  style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
  document.head.appendChild(style);
  window.print();
  window.addEventListener("afterprint", () => style.remove(), { once: true });
}

export const Route = createFileRoute("/_authenticated/balancete-gerencial")({
  head: () => ({
    meta: [
      { title: "Balancete Gerencial | Grupo Agropecuário" },
      {
        name: "description",
        content:
          "Balancete gerencial resumido por linha de negócio, com as deduções da receita agrupadas em uma única coluna.",
      },
      { property: "og:title", content: "Balancete Gerencial" },
      {
        property: "og:description",
        content:
          "Receita bruta, deduções agrupadas, receita líquida, CPV e despesas por linha de negócio.",
      },
    ],
  }),
  component: BalanceteGerencial,
});

const hoje = new Date();

/**
 * Colunas de dedução da receita que, nesta versão resumida, não aparecem
 * individualmente — apenas somadas na coluna IMPOSTOS/DEV/ABAT.
 */
const COLUNAS_OCULTAS: ColKey[] = ["devolucao", "icms", "pis", "cofins", "inssRural", "outrosAbat"];
const COLUNAS_VISIVEIS = COLUNAS.filter((c) => !COLUNAS_OCULTAS.includes(c.key));

function BalanceteGerencial() {
  const [detalhe, setDetalhe] = useState<{
    safra: number;
    linha: string;
    categoria: string;
  } | null>(null);

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
  /** Ano civil de um mês dentro da safra selecionada. */
  const anoCivil = (m: number, safra: number) => (m >= inicioSafra ? safra : safra + 1);

  const safras = [safraAtual - 1, safraAtual];

  const toggleMes = (m: number) =>
    setMeses((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const periodoLabel = mesesSel.length
    ? mesesSel.map((m) => MESES[m - 1]).join(", ")
    : "nenhum mês selecionado";

  const agg = useQuery({
    queryKey: ["balancete", safraAtual, mesesSel.join(",")],
    enabled: mesesSel.length > 0,
    queryFn: async () => {
      const partes = await Promise.all(
        mesesSel.map(async (m) => {
          const { data, error } = await supabase.rpc("balancete", {
            p_mes: m,
            p_ano: anoCivil(m, safraAtual),
          });
          if (error) throw error;
          return (data ?? []) as unknown as AggRow[];
        }),
      );
      const acc = new Map<string, AggRow>();
      for (const r of partes.flat()) {
        const k = `${r.safra_ano}|${r.linha}|${r.categoria}|${r.regra ?? ""}`;
        const at = acc.get(k);
        if (at) {
          at.valor = Number(at.valor) + Number(r.valor);
          at.qtd = Number(at.qtd) + Number(r.qtd);
        } else acc.set(k, { ...r, valor: Number(r.valor), qtd: Number(r.qtd) });
      }
      return [...acc.values()];
    },
  });

  const refMes = mesesSel[mesesSel.length - 1] ?? inicioSafra;
  const refAno = anoCivil(refMes, safraAtual);

  const rateioAdmQ = useQuery({
    queryKey: ["rateio_adm_vigente", refMes, refAno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rateio_adm_vigente", {
        p_ano: refAno,
        p_mes: refMes,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rateioAdm = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rateioAdmQ.data ?? []) m[r.linha_negocio] = Number(r.percentual);
    return m;
  }, [rateioAdmQ.data]);

  const rateioTribQ = useQuery({
    queryKey: ["rateio_trib_vigente", refMes, refAno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rateio_trib_vigente", {
        p_ano: refAno,
        p_mes: refMes,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rateioTrib = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rateioTribQ.data ?? []) m[r.linha_negocio] = Number(r.percentual);
    return m;
  }, [rateioTribQ.data]);

  /** Ajustes gerenciais manuais do período selecionado. */
  const ajustesQ = useQuery({
    queryKey: ["ajustes", safraAtual],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ajustes")
        .select("*")
        .in("safra_ano", [safraAtual - 1, safraAtual]);
      if (error) throw error;
      return (data ?? []) as unknown as Ajuste[];
    },
  });

  const ajustes = useMemo(
    () => (ajustesQ.data ?? []).filter((a) => mesesSel.includes(a.mes)),
    [ajustesQ.data, mesesSel],
  );

  const rel = useMemo(
    () => montarRelatorio(agg.data ?? [], safras, {}, rateioAdm, rateioTrib, ajustes),
    [agg.data, safras.join(), rateioAdm, rateioTrib, ajustes],
  );

  const detalheQ = useQuery({
    queryKey: ["detalhe", safraAtual, mesesSel.join(","), detalhe],
    enabled: !!detalhe,
    queryFn: async () => {
      const partes = await Promise.all(
        mesesSel.map(async (m) => {
          const { data, error } = await supabase.rpc("balancete_detalhe", {
            p_mes: m,
            p_ano: anoCivil(m, safraAtual),
            p_safra: detalhe!.safra,
            p_linha: detalhe!.linha,
            p_categoria: detalhe!.categoria,
          });
          if (error) throw error;
          return data ?? [];
        }),
      );
      return partes.flat().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    },
  });

  const totalBaseDetalhe = (detalheQ.data ?? []).reduce((a, r) => a + Number(r.vlcusto), 0);
  const ajustesDetalhe = ajustes.filter(
    (a) =>
      !!detalhe &&
      a.safra_ano === detalhe.safra &&
      a.linha_negocio === detalhe.linha &&
      a.categoria === detalhe.categoria,
  );
  const totalAjusteDetalhe = ajustesDetalhe.reduce((a, r) => a + Number(r.valor), 0);

  return (
    <AppLayout
      titulo="Balancete Gerencial"
      descricao={`Consolidado do grupo — ${periodoLabel} · safra ${safraLabel(safraAtual)} vs ${safraLabel(safraAtual - 1)} · deduções agrupadas em IMPOSTOS/DEV/ABAT`}
      acoes={
        <>
          <Button variant="outline" onClick={exportarPdfPaisagem} disabled={!agg.data?.length}>
            <FileDown className="size-4" /> Exportar PDF
          </Button>
          <Button
            onClick={() =>
              exportarBalancete(
                rel,
                `${periodoLabel} — safra ${safraLabel(safraAtual)} e ${safraLabel(safraAtual - 1)}`,
                `Balancete_Gerencial_${safraAtual}-${safraAtual + 1}.xlsx`,
              )
            }
            disabled={!agg.data?.length}
          >
            <Download className="size-4" /> Exportar Excel
          </Button>
        </>
      }
    >
      <Card className="mb-6 print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período do balancete</CardTitle>
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
              Selecione ao menos um mês para gerar o balancete.
            </p>
          )}

          {!!rel.naoMapeado[safraAtual] && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-4" />
              {formatBRL(rel.naoMapeado[safraAtual])} sem classificação nesta safra — resolva em
              Pendências.
            </div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .bg-print-table-wrap {
            overflow: hidden !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .bg-print-area table {
            table-layout: fixed !important;
            width: 100% !important;
            font-size: 6px !important;
            line-height: 1.05 !important;
          }
          .bg-print-area th,
          .bg-print-area td {
            padding: 0.5px 3px !important;
            position: static !important;
            overflow: hidden;
          }
          .bg-print-area .num {
            font-size: 6px !important;
            white-space: nowrap !important;
          }
          .bg-print-table-wrap table th:first-child,
          .bg-print-table-wrap table td:first-child {
            width: 13% !important;
            min-width: 0 !important;
          }
          .bg-print-table-wrap table th:nth-child(2),
          .bg-print-table-wrap table td:nth-child(2) {
            width: 6% !important;
            min-width: 0 !important;
          }
        }
      `}</style>

      <div className="bg-print-area">
        <div className="bg-print-table-wrap overflow-auto rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="sticky left-0 z-10 w-40 min-w-40 bg-primary px-3 py-2 text-left font-semibold">
                  DESCRIÇÃO
                </th>
                <th className="sticky left-40 z-10 w-20 min-w-20 bg-primary px-2 py-2 text-left font-semibold">
                  ANO
                </th>
                {COLUNAS_VISIVEIS.map((c) => (
                  <th
                    key={c.key}
                    className="px-2 py-2 text-right font-semibold whitespace-pre-line"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ...rel.linhas.map((l) => ({
                  rotulo: l.linha,
                  valores: l.valores,
                  total: false,
                })),
                { rotulo: "TOTAL", valores: rel.total, total: true },
              ].map((grupo) => (
                <Fragment key={grupo.rotulo}>
                  {safras
                    .slice()
                    .reverse()
                    .map((safra, idx) => (
                      <tr
                        key={safra}
                        className={`${idx === 0 ? "border-t-2 border-primary" : "border-t border-border/60"} ${grupo.total ? "bg-muted font-semibold" : "hover:bg-muted/50"} ${idx !== 0 ? "text-destructive" : ""}`}
                      >
                        {idx === 0 && (
                          <td
                            rowSpan={safras.length}
                            className={`sticky left-0 z-10 w-40 min-w-40 px-3 py-1.5 align-middle font-medium ${grupo.total ? "bg-muted" : "bg-card"}`}
                          >
                            {grupo.rotulo}
                          </td>
                        )}
                        <td
                          className={`sticky left-40 z-10 w-20 min-w-20 px-2 py-1.5 whitespace-nowrap ${idx !== 0 ? "text-destructive" : "text-muted-foreground"} ${grupo.total ? "bg-muted" : "bg-card"}`}
                        >
                          {safraLabel(safra)}
                        </td>
                        {COLUNAS_VISIVEIS.map((c) => (
                          <td
                            key={c.key}
                            onClick={() =>
                              !grupo.total &&
                              c.cat &&
                              setDetalhe({ safra, linha: grupo.rotulo, categoria: c.cat })
                            }
                            className={`num px-2 py-1.5 text-right ${!grupo.total && c.cat ? "cursor-pointer hover:underline" : "font-semibold"}`}
                          >
                            {formatBRL(grupo.valores[safra][c.key as ColKey])}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              ))}
              {/* No print, o Resultado consolidado continua na mesma tabela — só a coluna SALDO é preenchida. */}
              {rel.blocos.map((b) => (
                <Fragment key={`print-${b.rotulo}`}>
                  {safras
                    .slice()
                    .reverse()
                    .map((s, idx) => (
                      <tr
                        key={s}
                        className={`hidden print:table-row ${idx === 0 ? "border-t border-border/60" : ""} ${b.destaque ? "font-semibold" : ""} ${b.informativo ? "italic" : ""} ${idx !== 0 ? "text-destructive" : ""}`}
                      >
                        {idx === 0 && (
                          <td
                            rowSpan={safras.length}
                            className="px-3 py-1.5 align-middle font-medium"
                          >
                            {b.rotulo}
                          </td>
                        )}
                        <td
                          className={`px-2 py-1.5 whitespace-nowrap ${idx !== 0 ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {safraLabel(s)}
                        </td>
                        {COLUNAS_VISIVEIS.slice(0, -1).map((c) => (
                          <td key={c.key} />
                        ))}
                        <td className="num px-2 py-1.5 text-right font-semibold">
                          {formatBRL(b.saldos[s])}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <Card className="mt-6 print:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resultado consolidado</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="w-40 min-w-40 px-3 py-2 text-left font-medium">DESCRIÇÃO</th>
                  <th className="w-20 min-w-20 px-2 py-2 text-left font-medium">ANO</th>
                  <th className="px-3 py-2 text-right font-medium">SALDO</th>
                </tr>
              </thead>
              <tbody>
                {rel.blocos.map((b) => (
                  <Fragment key={b.rotulo}>
                    {safras
                      .slice()
                      .reverse()
                      .map((s, idx) => (
                        <tr
                          key={s}
                          className={`${idx === 0 ? "border-t border-border" : "border-b border-border"} ${b.destaque ? "bg-muted font-semibold" : ""} ${b.informativo ? "italic" : ""} ${idx !== 0 ? "text-destructive" : b.informativo ? "text-muted-foreground" : ""}`}
                        >
                          {idx === 0 && (
                            <td
                              rowSpan={safras.length}
                              className="w-40 min-w-40 px-3 py-1.5 align-middle"
                            >
                              {b.rotulo}
                            </td>
                          )}
                          <td
                            className={`w-20 min-w-20 px-2 py-1.5 whitespace-nowrap ${idx !== 0 ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {safraLabel(s)}
                          </td>
                          <td className="num px-3 py-1.5 text-right">{formatBRL(b.saldos[s])}</td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detalhe?.linha} · {detalhe?.categoria} · safra{" "}
              {detalhe ? safraLabel(detalhe.safra) : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-medium">Lançamentos da base</p>
          <div className="max-h-[20rem] overflow-auto rounded-md border border-border">
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
              </tbody>
            </table>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Exibindo até 500 lançamentos.</span>
            <span className="num">Subtotal da base: {formatBRL(totalBaseDetalhe)}</span>
          </div>

          <p className="mt-2 text-xs font-medium">Ajustes gerenciais manuais</p>
          <div className="max-h-40 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Período</th>
                  <th className="px-2 py-2 text-left font-medium">Motivo</th>
                  <th className="px-2 py-2 text-left font-medium">Usuário</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {ajustesDetalhe.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-2 py-1 whitespace-nowrap">{MESES[a.mes - 1]}</td>
                    <td className="px-2 py-1">{a.descricao}</td>
                    <td className="px-2 py-1">{a.user_email ?? "—"}</td>
                    <td
                      className={`num px-2 py-1 text-right ${Number(a.valor) < 0 ? "text-destructive" : ""}`}
                    >
                      {Number(a.valor) < 0 ? "−" : "+"}
                      {formatBRL(Math.abs(Number(a.valor)))}
                    </td>
                  </tr>
                ))}
                {!ajustesDetalhe.length && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                      Nenhum ajuste manual neste cruzamento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="num text-right text-xs font-medium">
            Base {formatBRL(totalBaseDetalhe)} + ajustes {formatBRL(totalAjusteDetalhe)} ={" "}
            {formatBRL(totalBaseDetalhe + totalAjusteDetalhe)}
          </p>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
