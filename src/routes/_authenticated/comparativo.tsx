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
import {
  LINHAS,
  MESES,
  montarRelatorio,
  safraDe,
  safraLabel,
  type AggRow,
  type Ajuste,
  type Valores,
} from "@/lib/balancete";
import { exportarPlanilha } from "@/lib/excel";
import { Download, FileDown } from "lucide-react";

/** Imprime só esta página em A4 paisagem, sem afetar o print das demais telas. */
function exportarPdfPaisagem() {
  const style = document.createElement("style");
  style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
  document.head.appendChild(style);
  window.print();
  window.addEventListener("afterprint", () => style.remove(), { once: true });
}

export const Route = createFileRoute("/_authenticated/comparativo")({
  head: () => ({
    meta: [
      { title: "Comparativo Mensal | Grupo Agropecuário" },
      {
        name: "description",
        content:
          "Comparativo mensal das atividades operacionais: resultado de cada mês isolado e acumulado da safra por linha de negócio.",
      },
      { property: "og:title", content: "Comparativo Mensal" },
      {
        property: "og:description",
        content: "Resultado mês a mês e acumulado da safra por linha de negócio.",
      },
    ],
  }),
  component: Comparativo,
});

const hoje = new Date();

/** Indicadores exibidos para cada atividade, na ordem do modelo. */
const INDICADORES: { key: keyof Valores; label: string; destaque?: boolean; saldo?: boolean }[] = [
  { key: "receitaBruta", label: "Receita Bruta" },
  { key: "impostosDevAbat", label: "(-) Impostos / Devoluções / Abatimentos" },
  { key: "receitaLiquida", label: "Receita Líquida" },
  { key: "hedge", label: "Hedge (+/-)" },
  { key: "cpv", label: "(-) CPV / CMV" },
  { key: "lucroBruto", label: "Lucro Bruto", destaque: true },
  { key: "despAdm", label: "(-) Despesas Administrativas" },
  { key: "despTrib", label: "(-) Despesas Tributárias" },
  { key: "despVendas", label: "(-) Despesas de Vendas" },
  { key: "saldo", label: "Resultado da Atividade (Saldo)", destaque: true, saldo: true },
];

/** Valor inteiro em R$, com negativos entre parênteses (padrão do relatório). */
function formatInt(v: number): string {
  if (!v || Math.abs(v) < 0.5) return "-";
  const s = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.abs(v));
  return v < 0 ? `(${s})` : s;
}

function formatMargem(saldo: number, receitaLiquida: number): string {
  if (!receitaLiquida) return "-";
  const p = (saldo / receitaLiquida) * 100;
  const s = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(p));
  return p < 0 ? `(${s}%)` : `${s}%`;
}

function Comparativo() {
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
  const [safra, setSafra] = useState(safraPadrao);
  const [mesFinal, setMesFinal] = useState(hoje.getMonth() + 1);

  /** Meses na ordem do ano-safra (Abril → Março, conforme configuração). */
  const mesesOrdem = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ((inicioSafra - 1 + i) % 12) + 1),
    [inicioSafra],
  );
  /** Do início da safra até o mês comparado. */
  const meses = useMemo(
    () => mesesOrdem.slice(0, mesesOrdem.indexOf(mesFinal) + 1),
    [mesesOrdem, mesFinal],
  );
  const anoCivil = (m: number) => (m >= inicioSafra ? safra : safra + 1);
  const rotuloMes = (m: number) => `${MESES[m - 1].slice(0, 3)}/${String(anoCivil(m)).slice(2)}`;

  const mesComparado = meses[meses.length - 1];
  const mesBase = meses.length > 1 ? meses[meses.length - 2] : undefined;

  /** Para cada mês: agregado da base + rateios vigentes naquele mês. */
  const dadosQ = useQuery({
    queryKey: ["comparativo", safra, meses.join(",")],
    enabled: meses.length > 0,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      Promise.all(
        meses.map(async (m) => {
          const ano = m >= inicioSafra ? safra : safra + 1;
          const [agg, adm, trib] = await Promise.all([
            supabase.rpc("balancete_periodo", { p_meses: [m], p_safra: safra }),
            supabase.rpc("rateio_adm_vigente", { p_ano: ano, p_mes: m }),
            supabase.rpc("rateio_trib_vigente", { p_ano: ano, p_mes: m }),
          ]);
          if (agg.error) throw agg.error;
          if (adm.error) throw adm.error;
          if (trib.error) throw trib.error;
          const rows = ((agg.data ?? []) as unknown as AggRow[]).map((r) => ({
            ...r,
            valor: Number(r.valor),
            qtd: Number(r.qtd),
          }));
          const rateioAdm: Record<string, number> = {};
          for (const r of adm.data ?? []) rateioAdm[r.linha_negocio] = Number(r.percentual);
          const rateioTrib: Record<string, number> = {};
          for (const r of trib.data ?? []) rateioTrib[r.linha_negocio] = Number(r.percentual);
          return { mes: m, rows, rateioAdm, rateioTrib };
        }),
      ),
  });

  const ajustesQ = useQuery({
    queryKey: ["ajustes-safra", safra],
    queryFn: async () => {
      const { data, error } = await supabase.from("ajustes").select("*").eq("safra_ano", safra);
      if (error) throw error;
      return (data ?? []) as unknown as Ajuste[];
    },
  });

  /** Valores de cada mês isolado, por atividade (linhas + TOTAL). */
  const porMes = useMemo(() => {
    const out: { mes: number; porAtividade: Record<string, Valores> }[] = [];
    for (const d of dadosQ.data ?? []) {
      const ajustes = (ajustesQ.data ?? []).filter((a) => a.mes === d.mes);
      const rel = montarRelatorio(d.rows, [safra], {}, d.rateioAdm, d.rateioTrib, ajustes);
      const porAtividade: Record<string, Valores> = {};
      for (const l of rel.linhas) porAtividade[l.linha] = l.valores[safra];
      porAtividade.TOTAL = rel.total[safra];
      out.push({ mes: d.mes, porAtividade });
    }
    return out;
  }, [dadosQ.data, ajustesQ.data, safra]);

  const atividades = [...LINHAS, "TOTAL"];
  const valor = (mesIdx: number, atividade: string, key: keyof Valores) =>
    porMes[mesIdx]?.porAtividade[atividade]?.[key] ?? 0;
  const acumulado = (atividade: string, key: keyof Valores) =>
    porMes.reduce((a, m) => a + (m.porAtividade[atividade]?.[key] ?? 0), 0);

  function exportarExcel() {
    const rows: Record<string, unknown>[] = [];
    for (const at of atividades) {
      for (const ind of INDICADORES) {
        const row: Record<string, unknown> = { Atividade: at, Indicador: ind.label };
        porMes.forEach((m, i) => (row[rotuloMes(m.mes)] = Math.round(valor(i, at, ind.key))));
        row.Acumulado = Math.round(acumulado(at, ind.key));
        rows.push(row);
      }
      const margem: Record<string, unknown> = {
        Atividade: at,
        Indicador: "Margem do Resultado (% Rec. Líquida)",
      };
      porMes.forEach((m, i) => {
        const rl = valor(i, at, "receitaLiquida");
        margem[rotuloMes(m.mes)] = rl ? valor(i, at, "saldo") / rl : null;
      });
      const rlAc = acumulado(at, "receitaLiquida");
      margem.Acumulado = rlAc ? acumulado(at, "saldo") / rlAc : null;
      rows.push(margem);
    }
    exportarPlanilha(rows, `Comparativo_${safra}-${safra + 1}.xlsx`);
  }

  const carregando = dadosQ.isLoading || ajustesQ.isLoading;

  return (
    <AppLayout
      titulo="Comparativo"
      descricao={`Comparativo mensal das atividades operacionais — safra ${safraLabel(safra)} · mês isolado e acumulado`}
      ocultarCabecalhoImpressao
      acoes={
        <>
          <Button variant="outline" onClick={exportarPdfPaisagem} disabled={!porMes.length}>
            <FileDown className="size-4" /> Exportar PDF
          </Button>
          <Button onClick={exportarExcel} disabled={!porMes.length}>
            <Download className="size-4" /> Exportar Excel
          </Button>
        </>
      }
    >
      <Card className="mb-6 print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Ano-safra</label>
            <Select value={String(safra)} onValueChange={(v) => setSafra(Number(v))}>
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
          <div>
            <label className="text-xs text-muted-foreground">Mês comparado (atual)</label>
            <Select value={String(mesFinal)} onValueChange={(v) => setMesFinal(Number(v))}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesOrdem.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {MESES[m - 1]}/{String(anoCivil(m)).slice(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            Exibe cada mês de {rotuloMes(mesesOrdem[0])} até {rotuloMes(mesFinal)} isoladamente e o
            acumulado no final.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3">
            <h2 className="font-display text-base font-semibold text-primary">
              COMPARATIVO MENSAL DAS ATIVIDADES OPERACIONAIS – SAFRA {safraLabel(safra)}
            </h2>
            <div className="mt-1 grid w-fit grid-cols-[auto_auto] gap-x-4 text-xs">
              <span className="font-medium">Mês base (anterior):</span>
              <span className="rounded bg-sidebar-primary px-2 text-center font-semibold text-sidebar-primary-foreground">
                {mesBase ? rotuloMes(mesBase) : "-"}
              </span>
              <span className="font-medium">Mês comparado (atual):</span>
              <span className="mt-0.5 rounded bg-sidebar-primary px-2 text-center font-semibold text-sidebar-primary-foreground">
                {mesComparado ? rotuloMes(mesComparado) : "-"}
              </span>
            </div>
          </div>

          {carregando && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          )}

          {!carregando && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground">
                    <th />
                    {porMes.map((m) => (
                      <th key={m.mes} className="px-2 text-right font-normal">
                        MENSAL
                      </th>
                    ))}
                    <th />
                  </tr>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="sticky left-0 z-10 min-w-64 bg-primary px-2 py-1.5 text-center font-semibold">
                      Atividade / Indicador
                    </th>
                    {porMes.map((m) => (
                      <th
                        key={m.mes}
                        className="px-2 py-1.5 text-right font-semibold whitespace-nowrap"
                      >
                        {rotuloMes(m.mes)}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-semibold">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {atividades.map((at) => (
                    <Fragment key={at}>
                      <tr>
                        <td colSpan={porMes.length + 2} className="pt-4" />
                      </tr>
                      <tr className={at === "TOTAL" ? "bg-primary/15" : "bg-accent"}>
                        <td
                          colSpan={porMes.length + 2}
                          className={`sticky left-0 border-l-4 px-2 py-1 font-semibold ${at === "TOTAL" ? "border-primary text-primary" : "border-sidebar-primary text-accent-foreground"}`}
                        >
                          {at}
                        </td>
                      </tr>
                      {INDICADORES.map((ind) => (
                        <tr
                          key={ind.key}
                          className={`hover:bg-muted/50 ${ind.saldo ? "border-t border-primary" : ""} ${ind.destaque ? "font-semibold" : ""}`}
                        >
                          <td className="sticky left-0 bg-card px-2 py-0.5 whitespace-nowrap">
                            {ind.label}
                          </td>
                          {porMes.map((m, i) => (
                            <td
                              key={m.mes}
                              className="num px-2 py-0.5 text-right whitespace-nowrap"
                            >
                              {formatInt(valor(i, at, ind.key))}
                            </td>
                          ))}
                          <td className="num px-2 py-0.5 text-right font-semibold whitespace-nowrap">
                            {formatInt(acumulado(at, ind.key))}
                          </td>
                        </tr>
                      ))}
                      <tr className="italic">
                        <td className="sticky left-0 bg-card px-2 py-0.5 whitespace-nowrap">
                          Margem do Resultado (% Rec. Líquida)
                        </td>
                        {porMes.map((m, i) => (
                          <td key={m.mes} className="num px-2 py-0.5 text-right">
                            {formatMargem(valor(i, at, "saldo"), valor(i, at, "receitaLiquida"))}
                          </td>
                        ))}
                        <td className="num px-2 py-0.5 text-right">
                          {formatMargem(acumulado(at, "saldo"), acumulado(at, "receitaLiquida"))}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
