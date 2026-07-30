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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COLUNAS,
  LINHAS,
  MESES,
  formatBRL,
  montarRelatorio,
  safraDe,
  safraLabel,
  type AggRow,
  type ColKey,
} from "@/lib/balancete";
import { exportarBalancete } from "@/lib/excel";
import { Download, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/balancete")({
  head: () => ({
    meta: [
      { title: "Balancete Gerencial | Grupo Agropecuário" },
      { name: "description", content: "Balancete gerencial consolidado por linha de negócio, comparando o ano-safra atual com o anterior." },
      { property: "og:title", content: "Balancete Gerencial Consolidado" },
      { property: "og:description", content: "Receita bruta, deduções, receita líquida, CPV e rateio de despesas por linha de negócio." },
    ],
  }),
  component: Balancete,
});

const hoje = new Date();

function Balancete() {
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
  const mesesSel = useMemo(
    () => mesesOrdem.filter((m) => meses.includes(m)),
    [mesesOrdem, meses],
  );
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

  const vigenciaAdm = rateioAdmQ.data?.[0]?.vigencia as string | undefined;

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

  const vigenciaTrib = rateioTribQ.data?.[0]?.vigencia as string | undefined;

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

  return (
    <AppLayout
      titulo="Balancete Gerencial"
      descricao={`Consolidado do grupo — ${periodoLabel} · safra ${safraLabel(safraAtual)} vs ${safraLabel(safraAtual - 1)}`}
      acoes={
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
      }
    >
      <Card className="mb-6">
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
              onClick={() => setMeses(mesesOrdem.slice(0, mesesOrdem.indexOf(hoje.getMonth() + 1) + 1))}
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
                  <span className="ml-1 opacity-70">/{String(anoCivil(m, safraAtual)).slice(2)}</span>
                </button>
              );
            })}
          </div>

          {!mesesSel.length && (
            <p className="mt-3 text-xs text-destructive">
              Selecione ao menos um mês para gerar o balancete.
            </p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            DESP. ADM das contas 3.4.01.* seguem regra própria: centro de custo 01.14.0003 e a conta
            3.4.01.10.0003 com CODTMV 1.2.13 vão 100% para OUTROS; o restante é rateado pelos
            percentuais{" "}
            {vigenciaAdm
              ? `vigentes desde ${MESES[Number(vigenciaAdm.slice(5, 7)) - 1]}/${vigenciaAdm.slice(0, 4)}`
              : "definidos em Configurações"}{" "}
            ({LINHAS.map((l) => `${l}: ${(rateioAdm[l] ?? 0).toFixed(2)}%`).join(" · ")}).
          </p>
          {!!vigenciaTrib && (
            <p className="mt-2 text-xs text-muted-foreground">
              DESP. TRIBUT usa os percentuais vigentes desde{" "}
              {MESES[Number(vigenciaTrib.slice(5, 7)) - 1]}/{vigenciaTrib.slice(0, 4)} (
              {LINHAS.map((l) => `${l}: ${(rateioTrib[l] ?? 0).toFixed(2)}%`).join(" · ")}).
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


      <div className="overflow-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="sticky left-0 z-10 bg-primary px-3 py-2 text-left font-semibold">
                DESCRIÇÃO
              </th>
              <th className="bg-primary px-2 py-2 text-left font-semibold">ANO</th>
              {COLUNAS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-semibold whitespace-pre-line">
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
                      className={`${idx === 0 ? "border-t-2 border-primary" : "border-t border-border/60"} ${grupo.total ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}
                    >
                      {idx === 0 && (
                        <td
                          rowSpan={safras.length}
                          className={`sticky left-0 z-10 px-3 py-1.5 align-middle font-medium ${grupo.total ? "bg-muted" : "bg-card"}`}
                        >
                          {grupo.rotulo}
                        </td>
                      )}
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {safraLabel(safra)}
                      </td>
                      {COLUNAS.map((c) => (
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
          </tbody>
        </table>

      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultado consolidado</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">DESCRIÇÃO</th>
                <th className="px-3 py-2 text-left font-medium">ANO</th>
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
                        className={`${idx === 0 ? "border-t border-border" : "border-b border-border"} ${b.destaque ? "bg-muted font-semibold" : ""} ${b.informativo ? "text-muted-foreground italic" : ""}`}
                      >
                        {idx === 0 && (
                          <td rowSpan={safras.length} className="px-3 py-1.5 align-middle">
                            {b.rotulo}
                          </td>
                        )}
                        <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
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

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detalhe?.linha} · {detalhe?.categoria} · safra{" "}
              {detalhe ? safraLabel(detalhe.safra) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[26rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Data</th>
                  <th className="px-2 py-2 text-left font-medium">Empresa</th>
                  <th className="px-2 py-2 text-left font-medium">Depto</th>
                  <th className="px-2 py-2 text-left font-medium">Produto</th>
                  <th className="px-2 py-2 text-left font-medium">Conta</th>
                  <th className="px-2 py-2 text-left font-medium">Documento</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(detalheQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="num px-2 py-1">
                      {new Date(r.data as string).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-2 py-1">{r.nomecoligada}</td>
                    <td className="px-2 py-1">{r.nomedepto}</td>
                    <td className="max-w-56 truncate px-2 py-1">{r.produto}</td>
                    <td className="px-2 py-1">{r.contacontabil}</td>
                    <td className="px-2 py-1">{r.documento}</td>
                    <td className="num px-2 py-1 text-right">{formatBRL(Number(r.vlcusto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Exibindo até 500 lançamentos.</p>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
