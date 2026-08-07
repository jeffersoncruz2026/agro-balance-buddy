import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
  LINHAS,
  MESES,
  PREFIXO_ADM,
  CUSTO_ADM_OUTROS,
  CONTA_ADM_OUTROS,
  PRODUTO_ADM_EXCECAO,
  CUSTO_VENDAS_FIXO,
  LINHAS_VENDAS_FIXO,
  safraLabel,
} from "@/lib/balancete";


export const Route = createFileRoute("/_authenticated/_admin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Balancete Gerencial" },
      { name: "description", content: "Defina o mês de início do ano-safra usado na comparação entre safras do balancete gerencial." },
      { property: "og:title", content: "Configurações do Balancete Gerencial" },
      { property: "og:description", content: "Mês de início do ano-safra e preferências do fechamento mensal." },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(4);

  const { data } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data?.safra_start_month) setMes(data.safra_start_month);
  }, [data?.safra_start_month]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ id: true, safra_start_month: mes }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const anoEx = new Date().getFullYear();

  // ---- Rateio das Despesas Administrativas (contas 3.4.01.*) ----
  const hoje = new Date();
  const [vMes, setVMes] = useState(hoje.getMonth() + 1);
  const [vAno, setVAno] = useState(hoje.getFullYear());
  const [pcts, setPcts] = useState<Record<string, string>>({});

  const adm = useQuery({
    queryKey: ["rateio_adm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rateio_adm")
        .select("*")
        .order("vigencia", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const vigencias = useMemo(() => {
    const m = new Map<string, { linha_negocio: string; percentual: number; updated_at: string }[]>();
    for (const r of adm.data ?? []) {
      const arr = m.get(r.vigencia) ?? [];
      arr.push({
        linha_negocio: r.linha_negocio,
        percentual: Number(r.percentual),
        updated_at: r.updated_at,
      });
      m.set(r.vigencia, arr);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [adm.data]);

  const vigenciaSel = `${vAno}-${String(vMes).padStart(2, "0")}-01`;

  useEffect(() => {
    const atual = (adm.data ?? []).filter((r) => r.vigencia === vigenciaSel);
    const base =
      atual.length > 0
        ? atual
        : (adm.data ?? []).filter(
            (r) => r.vigencia === (adm.data ?? []).find((x) => x.vigencia <= vigenciaSel)?.vigencia,
          );
    const next: Record<string, string> = {};
    for (const l of LINHAS) {
      const row = base.find((r) => r.linha_negocio === l);
      next[l] = row ? String(Number(row.percentual)) : "";
    }
    setPcts(next);
  }, [adm.data, vigenciaSel]);

  const somaAdm = LINHAS.reduce((a, l) => a + (Number(pcts[l]) || 0), 0);

  const salvarAdm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rateio_adm").upsert(
        LINHAS.map((l) => ({
          vigencia: vigenciaSel,
          linha_negocio: l,
          percentual: Number(pcts[l]) || 0,
        })),
        { onConflict: "vigencia,linha_negocio" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Percentuais válidos a partir de ${MESES[vMes - 1]}/${vAno}.`);
      qc.invalidateQueries({ queryKey: ["rateio_adm"] });
      qc.invalidateQueries({ queryKey: ["balancete"] });
      qc.invalidateQueries({ queryKey: ["rateio_adm_vigente"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- Rateio das Despesas Tributárias ----
  const [tMes, setTMes] = useState(hoje.getMonth() + 1);
  const [tAno, setTAno] = useState(hoje.getFullYear());
  const [pctsTrib, setPctsTrib] = useState<Record<string, string>>({});

  const trib = useQuery({
    queryKey: ["rateio_trib"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rateio_trib")
        .select("*")
        .order("vigencia", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const vigenciasTrib = useMemo(() => {
    const m = new Map<string, { linha_negocio: string; percentual: number; updated_at: string }[]>();
    for (const r of trib.data ?? []) {
      const arr = m.get(r.vigencia) ?? [];
      arr.push({
        linha_negocio: r.linha_negocio,
        percentual: Number(r.percentual),
        updated_at: r.updated_at,
      });
      m.set(r.vigencia, arr);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [trib.data]);

  const vigenciaTribSel = `${tAno}-${String(tMes).padStart(2, "0")}-01`;

  useEffect(() => {
    const atual = (trib.data ?? []).filter((r) => r.vigencia === vigenciaTribSel);
    const base =
      atual.length > 0
        ? atual
        : (trib.data ?? []).filter(
            (r) => r.vigencia === (trib.data ?? []).find((x) => x.vigencia <= vigenciaTribSel)?.vigencia,
          );
    const next: Record<string, string> = {};
    for (const l of LINHAS) {
      const row = base.find((r) => r.linha_negocio === l);
      next[l] = row ? String(Number(row.percentual)) : "";
    }
    setPctsTrib(next);
  }, [trib.data, vigenciaTribSel]);

  const somaTrib = LINHAS.reduce((a, l) => a + (Number(pctsTrib[l]) || 0), 0);

  const salvarTrib = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rateio_trib").upsert(
        LINHAS.map((l) => ({
          vigencia: vigenciaTribSel,
          linha_negocio: l,
          percentual: Number(pctsTrib[l]) || 0,
        })),
        { onConflict: "vigencia,linha_negocio" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Percentuais válidos a partir de ${MESES[tMes - 1]}/${tAno}.`);
      qc.invalidateQueries({ queryKey: ["rateio_trib"] });
      qc.invalidateQueries({ queryKey: ["balancete"] });
      qc.invalidateQueries({ queryKey: ["rateio_trib_vigente"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- De/Para das Despesas de Vendas (NOMECUSTO → linha de negócio) ----
  const [novoCusto, setNovoCusto] = useState("");
  const [novaLinha, setNovaLinha] = useState<string>(LINHAS[0]);

  const custos = useQuery({
    queryKey: ["custo_map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custo_map")
        .select("*")
        .order("nomecusto");
      if (error) throw error;
      return data;
    },
  });

  const salvarCusto = useMutation({
    mutationFn: async (row: { nomecusto: string; linha_negocio: string }) => {
      const { error } = await supabase
        .from("custo_map")
        .upsert(
          { nomecusto: row.nomecusto.trim().toUpperCase(), linha_negocio: row.linha_negocio },
          { onConflict: "nomecusto" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mapeamento salvo.");
      setNovoCusto("");
      qc.invalidateQueries({ queryKey: ["custo_map"] });
      qc.invalidateQueries({ queryKey: ["balancete"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirCusto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custo_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custo_map"] });
      qc.invalidateQueries({ queryKey: ["balancete"] });
    },
    onError: (e) => toast.error(e.message),
  });


  return (
    <AppLayout titulo="Configurações" descricao="Parâmetros globais do fechamento gerencial.">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Ano-safra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Mês de início da safra</label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-56">
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
          <p className="text-sm text-muted-foreground">
            Lançamentos a partir de {MESES[mes - 1]}/{anoEx} pertencem à safra{" "}
            <span className="font-medium text-foreground">{safraLabel(anoEx)}</span>; meses
            anteriores pertencem à safra {safraLabel(anoEx - 1)}.
          </p>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">
            Rateio das Despesas Administrativas (contas {PREFIXO_ADM}*)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lançamentos com centro de custo{" "}
            <span className="font-medium text-foreground">{CUSTO_ADM_OUTROS}</span> — ou com conta{" "}
            <span className="font-medium text-foreground">{CONTA_ADM_OUTROS}</span> e produto
            diferente de{" "}
            <span className="font-medium text-foreground">{PRODUTO_ADM_EXCECAO}</span> — vão 100%
            para a linha <span className="font-medium text-foreground">OUTROS</span>. Os demais são
            rateados entre todas as linhas conforme os percentuais abaixo — OUTROS recebe a sua
            fatia do rateio somada aos valores diretos.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Vigente a partir de</label>
              <Select value={String(vMes)} onValueChange={(v) => setVMes(Number(v))}>
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
                value={vAno}
                onChange={(e) => setVAno(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {LINHAS.map((l) => (
              <div key={l} className="w-44">
                <label className="text-xs text-muted-foreground">{l}</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={pcts[l] ?? ""}
                  onChange={(e) => setPcts((p) => ({ ...p, [l]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <p
            className={`text-xs ${Math.abs(somaAdm - 100) < 0.01 ? "text-muted-foreground" : "text-destructive"}`}
          >
            Soma: {somaAdm.toFixed(2)}%{" "}
            {Math.abs(somaAdm - 100) < 0.01 ? "— ok." : "— deve totalizar 100%."}
          </p>

          <Button
            onClick={() => salvarAdm.mutate()}
            disabled={salvarAdm.isPending || Math.abs(somaAdm - 100) >= 0.01}
          >
            Salvar vigência
          </Button>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Histórico de vigências — meses já fechados continuam usando o percentual da época.
            </p>
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Vigente a partir de</th>
                    {LINHAS.map((l) => (
                      <th key={l} className="px-2 py-2 text-right font-medium">
                        {l}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Alterado em</th>
                  </tr>
                </thead>
                <tbody>
                  {vigencias.map(([vig, rows]) => {
                    const [y, m] = vig.split("-");
                    const alterado = rows
                      .map((r) => r.updated_at)
                      .sort()
                      .at(-1);
                    return (
                      <tr key={vig} className="border-t border-border">
                        <td className="px-2 py-1">
                          {MESES[Number(m) - 1]}/{y}
                        </td>
                        {LINHAS.map((l) => (
                          <td key={l} className="num px-2 py-1 text-right">
                            {(rows.find((r) => r.linha_negocio === l)?.percentual ?? 0).toFixed(2)}%
                          </td>
                        ))}
                        <td className="num px-2 py-1 text-right text-muted-foreground">
                          {alterado ? new Date(alterado).toLocaleDateString("pt-BR") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Rateio das Despesas Tributárias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Percentuais aplicados à categoria{" "}
            <span className="font-medium text-foreground">DESP. TRIBUT</span>, com vigência mensal —
            meses já fechados continuam usando o percentual da época. Se nenhuma vigência estiver
            definida, o sistema usa o rateio manual informado na tela do balancete.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Vigente a partir de</label>
              <Select value={String(tMes)} onValueChange={(v) => setTMes(Number(v))}>
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
                value={tAno}
                onChange={(e) => setTAno(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {LINHAS.map((l) => (
              <div key={l} className="w-44">
                <label className="text-xs text-muted-foreground">{l}</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={pctsTrib[l] ?? ""}
                  onChange={(e) => setPctsTrib((p) => ({ ...p, [l]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <p
            className={`text-xs ${Math.abs(somaTrib - 100) < 0.01 ? "text-muted-foreground" : "text-destructive"}`}
          >
            Soma: {somaTrib.toFixed(2)}%{" "}
            {Math.abs(somaTrib - 100) < 0.01 ? "— ok." : "— deve totalizar 100%."}
          </p>

          <Button
            onClick={() => salvarTrib.mutate()}
            disabled={salvarTrib.isPending || Math.abs(somaTrib - 100) >= 0.01}
          >
            Salvar vigência
          </Button>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Histórico de vigências
            </p>
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Vigente a partir de</th>
                    {LINHAS.map((l) => (
                      <th key={l} className="px-2 py-2 text-right font-medium">
                        {l}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Alterado em</th>
                  </tr>
                </thead>
                <tbody>
                  {vigenciasTrib.map(([vig, rows]) => {
                    const [y, m] = vig.split("-");
                    const alterado = rows
                      .map((r) => r.updated_at)
                      .sort()
                      .at(-1);
                    return (
                      <tr key={vig} className="border-t border-border">
                        <td className="px-2 py-1">
                          {MESES[Number(m) - 1]}/{y}
                        </td>
                        {LINHAS.map((l) => (
                          <td key={l} className="num px-2 py-1 text-right">
                            {(rows.find((r) => r.linha_negocio === l)?.percentual ?? 0).toFixed(2)}%
                          </td>
                        ))}
                        <td className="num px-2 py-1 text-right text-muted-foreground">
                          {alterado ? new Date(alterado).toLocaleDateString("pt-BR") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">
            Despesas de Vendas — De/Para por centro de custo (NOMECUSTO)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            NOMECUSTO{" "}
            <span className="font-medium text-foreground">{CUSTO_VENDAS_FIXO}</span> é dividido
            automaticamente 50% para{" "}
            <span className="font-medium text-foreground">{LINHAS_VENDAS_FIXO[0]}</span> e 50% para{" "}
            <span className="font-medium text-foreground">{LINHAS_VENDAS_FIXO[1]}</span> (fixo, não
            configurável). Os demais centros de custo são alocados diretamente na linha de negócio
            definida abaixo — sem rateio percentual. Sem mapeamento, o valor cai em OUTROS.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">NOMECUSTO</label>
              <Input
                className="w-64"
                placeholder="Ex.: COMERCIAL"
                value={novoCusto}
                onChange={(e) => setNovoCusto(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Linha de negócio</label>
              <Select value={novaLinha} onValueChange={setNovaLinha}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINHAS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() =>
                salvarCusto.mutate({ nomecusto: novoCusto, linha_negocio: novaLinha })
              }
              disabled={salvarCusto.isPending || !novoCusto.trim()}
            >
              Adicionar
            </Button>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">NOMECUSTO</th>
                  <th className="px-2 py-2 text-left font-medium">Linha de negócio</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(custos.data ?? []).map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-2 py-1">{c.nomecusto}</td>
                    <td className="px-2 py-1">
                      <Select
                        value={c.linha_negocio}
                        onValueChange={(v) =>
                          salvarCusto.mutate({ nomecusto: c.nomecusto, linha_negocio: v })
                        }
                      >
                        <SelectTrigger className="h-8 w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINHAS.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => excluirCusto.mutate(c.id)}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
                {(custos.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                      Nenhum centro de custo mapeado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>


      <Card className="mt-6 max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Como o balancete é montado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. A base bruta do mês é importada e armazenada por lançamento.</p>
          <p>
            2. O De/Para classifica cada lançamento em categoria (pela conta contábil, com suporte a
            prefixo) e em linha de negócio (pelo produto).
          </p>
          <p>
            3. RECEITA LÍQUIDA = RECEITA BRUTA − devoluções, ICMS, PIS, COFINS, INSS rural e outros
            abatimentos.
          </p>
          <p>
            4. DESP. TRIBUT segue os percentuais vigentes configurados acima. As DESP. ADM das
            contas {PREFIXO_ADM}* seguem a regra própria ({CCUSTO_ADM_OUTROS}, ou{" "}
            {CONTA_ADM_OUTROS} com CODTMV {CODTMV_ADM_OUTROS} → 100% OUTROS; demais → rateio
            percentual vigente). As DESP. VENDAS não usam rateio percentual: {CUSTO_VENDAS_FIXO} é
            50%/50% entre {LINHAS_VENDAS_FIXO[0]} e {LINHAS_VENDAS_FIXO[1]}, e os demais NOMECUSTO
            seguem o De/Para manual.
          </p>

          <p>5. O relatório é sempre consolidado, comparando a safra atual com a anterior.</p>

        </CardContent>
      </Card>
    </AppLayout>
  );
}
