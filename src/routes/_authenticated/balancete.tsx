import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const qc = useQueryClient();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
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

  const agg = useQuery({
    queryKey: ["balancete", mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("balancete", { p_mes: mes, p_ano: ano });
      if (error) throw error;
      return (data ?? []) as unknown as AggRow[];
    },
  });

  const rateioQ = useQuery({
    queryKey: ["rateio", mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rateio")
        .select("*")
        .eq("ano", ano)
        .eq("mes", mes);
      if (error) throw error;
      return data;
    },
  });

  const rateio = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rateioQ.data ?? []) m[r.linha_negocio] = Number(r.percentual);
    return m;
  }, [rateioQ.data]);

  const rateioAdmQ = useQuery({
    queryKey: ["rateio_adm_vigente", mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rateio_adm_vigente", { p_ano: ano, p_mes: mes });
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
    queryKey: ["rateio_trib_vigente", mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rateio_trib_vigente", { p_ano: ano, p_mes: mes });
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




  const salvarRateio = useMutation({
    mutationFn: async (v: { linha: string; percentual: number }) => {
      const { error } = await supabase.from("rateio").upsert(
        { ano, mes, linha_negocio: v.linha, percentual: v.percentual },
        { onConflict: "ano,mes,linha_negocio" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rateio", mes, ano] }),
    onError: (e) => toast.error(e.message),
  });

  const safraAtual = safraDe(ano, mes, inicioSafra);
  const safras = [safraAtual - 1, safraAtual];

  const rel = useMemo(
    () => montarRelatorio(agg.data ?? [], safras, rateio, rateioAdm, rateioTrib),
    [agg.data, safras.join(), rateio, rateioAdm, rateioTrib],
  );


  const somaRateio = LINHAS.reduce((a, l) => a + (rateio[l] || 0), 0);

  const detalheQ = useQuery({
    queryKey: ["detalhe", mes, ano, detalhe],
    enabled: !!detalhe,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("balancete_detalhe", {
        p_mes: mes,
        p_ano: ano,
        p_safra: detalhe!.safra,
        p_linha: detalhe!.linha,
        p_categoria: detalhe!.categoria,
      });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppLayout
      titulo="Balancete Gerencial"
      descricao={`Consolidado do grupo — ${MESES[mes - 1]} · safra ${safraLabel(safraAtual)} vs ${safraLabel(safraAtual - 1)}`}
      acoes={
        <Button onClick={() => exportarBalancete(rel, mes, ano)} disabled={!agg.data?.length}>
          <Download className="size-4" /> Exportar Excel
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Mês</label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Ano</label>
          <Input
            type="number"
            className="w-28"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          />
        </div>
        {!!rel.naoMapeado[safraAtual] && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-4" />
            {formatBRL(rel.naoMapeado[safraAtual])} sem classificação nesta safra — resolva em
            Pendências.
          </div>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Rateio manual de DESP. TRIBUT / VENDAS — {MESES[mes - 1]}/{ano}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap gap-3">
            {LINHAS.map((l) => (
              <div key={l} className="w-44">
                <label className="text-xs text-muted-foreground">{l}</label>
                <Input
                  type="number"
                  step="0.01"
                  value={rateio[l] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    salvarRateio.mutate({ linha: l, percentual: Number(e.target.value) || 0 })
                  }
                />
              </div>
            ))}
          </div>
          <p
            className={`mt-3 text-xs ${Math.abs(somaRateio - 100) < 0.01 ? "text-muted-foreground" : "text-destructive"}`}
          >
            Soma: {somaRateio.toFixed(2)}%
            {somaRateio === 0
              ? " — sem rateio definido, DESP. TRIBUT / VENDAS ficam na linha de origem."
              : Math.abs(somaRateio - 100) < 0.01
                ? " — ok."
                : " — recomendado totalizar 100%."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            DESP. ADM das contas 3.4.01.* seguem regra própria: centro de custo 01.14.0003 vai 100%
            para OUTROS e o restante é rateado pelos percentuais{" "}
            {vigenciaAdm
              ? `vigentes desde ${MESES[Number(vigenciaAdm.slice(5, 7)) - 1]}/${vigenciaAdm.slice(0, 4)}`
              : "definidos em Configurações"}{" "}
            ({LINHAS.map((l) => `${l}: ${(rateioAdm[l] ?? 0).toFixed(2)}%`).join(" · ")}). Edite em
            Configurações.
          </p>
          {!!vigenciaTrib && (
            <p className="mt-2 text-xs text-muted-foreground">
              DESP. TRIBUT usa os percentuais vigentes desde{" "}
              {MESES[Number(vigenciaTrib.slice(5, 7)) - 1]}/{vigenciaTrib.slice(0, 4)} (
              {LINHAS.map((l) => `${l}: ${(rateioTrib[l] ?? 0).toFixed(2)}%`).join(" · ")}),
              ignorando o rateio manual acima. Edite em Configurações.
            </p>
          )}



        </CardContent>
      </Card>

      <div className="overflow-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="sticky left-0 z-10 bg-primary px-3 py-2 text-left font-semibold">
                LINHA DE NEGÓCIO
              </th>
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
                      className={`${idx === 0 ? "border-t-2 border-primary" : "border-t border-border"} ${grupo.total ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}
                    >
                      <td
                        className={`sticky left-0 z-10 px-3 py-1.5 font-medium ${grupo.total ? "bg-muted" : "bg-card"}`}
                      >
                        <span className={idx === 0 ? "" : "opacity-0"}>{grupo.rotulo}</span>
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {safraLabel(safra)}
                        </span>
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
                <th className="px-3 py-2 text-left font-medium" />
                {safras
                  .slice()
                  .reverse()
                  .map((s) => (
                    <th key={s} className="px-3 py-2 text-right font-medium">
                      SAFRA {safraLabel(s)}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rel.blocos.map((b) => (
                <tr
                  key={b.rotulo}
                  className={`border-b border-border ${b.destaque ? "bg-muted font-semibold" : ""} ${b.informativo ? "text-muted-foreground italic" : ""}`}
                >
                  <td className="px-3 py-1.5">{b.rotulo}</td>
                  {safras
                    .slice()
                    .reverse()
                    .map((s) => (
                      <td key={s} className="num px-3 py-1.5 text-right">
                        {formatBRL(b.saldos[s])}
                      </td>
                    ))}
                </tr>
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
