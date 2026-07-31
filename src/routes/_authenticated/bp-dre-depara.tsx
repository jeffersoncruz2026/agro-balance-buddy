import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/balancete";
import { exportarPlanilha, lerPlanilhaSimples } from "@/lib/excel";
import { Trash2, Download, Upload } from "lucide-react";

const DEMONSTRATIVOS = ["BP", "DRE"] as const;

export const Route = createFileRoute("/_authenticated/bp-dre-depara")({
  head: () => ({
    meta: [
      { title: "De/Para BP/DRE | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Mapeamento de contas contábeis para o Balanço Patrimonial e a DRE (Demonstrativo, Seção, Linha e Ordem de exibição).",
      },
      { property: "og:title", content: "De/Para BP/DRE | Balancete Gerencial" },
      { property: "og:description", content: "Mapeamento reutilizado todo fechamento do BP/DRE." },
    ],
  }),
  component: BpDreDePara,
});

function BpDreDePara() {
  return (
    <AppLayout
      titulo="De/Para — BP/DRE"
      descricao="Cada conta é classificada por Demonstrativo (BP ou DRE) + Seção + Linha + Ordem de exibição — não depende da posição da linha na planilha."
    >
      <Tabs defaultValue="mapeamento">
        <TabsList>
          <TabsTrigger value="mapeamento">Mapeamento de contas</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>
        <TabsContent value="mapeamento" className="mt-4">
          <Mapeamento />
        </TabsContent>
        <TabsContent value="pendencias" className="mt-4">
          <Pendencias />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function Mapeamento() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState({
    conta: "",
    is_prefixo: true,
    demonstrativo: DEMONSTRATIVOS[0] as string,
    secao: "",
    linha: "",
    ordem_exibicao: 0,
  });

  const { data } = useQuery({
    queryKey: ["bp_dre_conta_map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bp_dre_conta_map")
        .select("*")
        .order("demonstrativo")
        .order("ordem_exibicao")
        .order("conta");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async (row: {
      conta: string;
      descricao?: string | null;
      is_prefixo: boolean;
      demonstrativo: string;
      secao: string | null;
      linha: string;
      ordem_exibicao: number;
    }) => {
      const { error } = await supabase
        .from("bp_dre_conta_map")
        .upsert(row, { onConflict: "conta,demonstrativo" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bp_dre_conta_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const filtradas = useMemo(
    () =>
      (data ?? []).filter((r) =>
        `${r.conta} ${r.secao ?? ""} ${r.linha} ${r.demonstrativo}`
          .toLowerCase()
          .includes(busca.toLowerCase()),
      ),
    [data, busca],
  );

  async function importarArquivo(file: File) {
    const rows = lerPlanilhaSimples(await file.arrayBuffer());
    const payload = rows
      .map((r) => {
        const conta = String(r["conta"] ?? r["CONTA"] ?? "").trim();
        const demonstrativo = String(r["demonstrativo"] ?? r["DEMONSTRATIVO"] ?? "")
          .trim()
          .toUpperCase();
        const linha = String(r["linha"] ?? r["LINHA"] ?? "").trim();
        if (!conta || !linha || !DEMONSTRATIVOS.includes(demonstrativo as never)) return null;
        return {
          conta,
          demonstrativo,
          linha,
          secao: String(r["secao"] ?? r["SEÇÃO"] ?? r["SECAO"] ?? "") || null,
          is_prefixo: String(r["is_prefixo"] ?? r["PREFIXO"] ?? "").toLowerCase() === "true",
          ordem_exibicao: Number(r["ordem_exibicao"] ?? r["ORDEM"] ?? 0) || 0,
        };
      })
      .filter(Boolean);
    if (!payload.length)
      return toast.error("Nenhuma linha válida (colunas: conta, demonstrativo, linha).");
    const { error } = await supabase
      .from("bp_dre_conta_map")
      .upsert(payload as never[], { onConflict: "conta,demonstrativo" });
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} regras importadas.`);
    qc.invalidateQueries();
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-36">
            <label className="text-xs text-muted-foreground">Conta ou prefixo</label>
            <Input
              value={nova.conta}
              onChange={(e) => setNova({ ...nova, conta: e.target.value })}
              placeholder="1.1.01"
            />
          </div>
          <div className="min-w-32">
            <label className="text-xs text-muted-foreground">Demonstrativo</label>
            <Select
              value={nova.demonstrativo}
              onValueChange={(v) => setNova({ ...nova, demonstrativo: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEMONSTRATIVOS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 flex-1">
            <label className="text-xs text-muted-foreground">Seção</label>
            <Input
              value={nova.secao}
              onChange={(e) => setNova({ ...nova, secao: e.target.value })}
              placeholder="Ativo Circulante"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="text-xs text-muted-foreground">Linha</label>
            <Input
              value={nova.linha}
              onChange={(e) => setNova({ ...nova, linha: e.target.value })}
              placeholder="Caixa e equivalentes"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground">Ordem</label>
            <Input
              type="number"
              value={nova.ordem_exibicao}
              onChange={(e) => setNova({ ...nova, ordem_exibicao: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch
              checked={nova.is_prefixo}
              onCheckedChange={(v) => setNova({ ...nova, is_prefixo: v })}
              id="prefixo"
            />
            <label htmlFor="prefixo" className="text-xs">
              Prefixo
            </label>
          </div>
          <Button
            onClick={() => {
              if (!nova.conta.trim()) return toast.error("Informe a conta.");
              if (!nova.linha.trim()) return toast.error("Informe a linha.");
              salvar.mutate({ ...nova, secao: nova.secao || null });
              setNova({ ...nova, conta: "", secao: "", linha: "" });
            }}
          >
            Adicionar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Buscar conta, seção, linha ou demonstrativo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Importar
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importarArquivo(e.target.files[0])}
          />
          <Button
            variant="outline"
            onClick={() =>
              exportarPlanilha(
                (data ?? []).map((r) => ({
                  conta: r.conta,
                  is_prefixo: r.is_prefixo,
                  demonstrativo: r.demonstrativo,
                  secao: r.secao,
                  linha: r.linha,
                  ordem_exibicao: r.ordem_exibicao,
                })),
                "depara_bp_dre.xlsx",
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
          <span className="text-xs text-muted-foreground">{filtradas.length} regras</span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Conta</th>
                <th className="px-3 py-2 text-left font-medium">Prefixo</th>
                <th className="px-3 py-2 text-left font-medium">Demonstrativo</th>
                <th className="px-3 py-2 text-left font-medium">Seção</th>
                <th className="px-3 py-2 text-left font-medium">Linha</th>
                <th className="px-3 py-2 text-right font-medium">Ordem</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="num px-3 py-1.5">{r.conta}</td>
                  <td className="px-3 py-1.5">
                    <Switch
                      checked={r.is_prefixo}
                      onCheckedChange={(v) =>
                        salvar.mutate({
                          conta: r.conta,
                          is_prefixo: v,
                          demonstrativo: r.demonstrativo,
                          secao: r.secao,
                          linha: r.linha,
                          ordem_exibicao: r.ordem_exibicao,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.demonstrativo}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.secao}</td>
                  <td className="px-3 py-1.5">{r.linha}</td>
                  <td className="num px-3 py-1.5 text-right">{r.ordem_exibicao}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remover.mutate(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtradas.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nenhuma regra cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Pendencias() {
  const qc = useQueryClient();
  const [empresaId, setEmpresaId] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [mes, setMes] = useState<string>("");
  const [novaLinha, setNovaLinha] = useState<
    Record<string, { demonstrativo: string; linha: string }>
  >({});

  const empresas = useQuery({
    queryKey: ["bp_dre_empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bp_dre_empresas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const pendencias = useQuery({
    queryKey: ["bp_dre_pendencias", empresaId, ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bp_dre_pendencias", {
        p_empresa_id: empresaId || undefined,
        p_ano: ano ? Number(ano) : undefined,
        p_mes: mes ? Number(mes) : undefined,
      });
      if (error) throw error;
      return data;
    },
  });

  const mapear = useMutation({
    mutationFn: async (v: {
      conta: string;
      descricao: string | null;
      demonstrativo: string;
      linha: string;
    }) => {
      const { error } = await supabase.from("bp_dre_conta_map").upsert(
        {
          conta: v.conta,
          descricao: v.descricao,
          demonstrativo: v.demonstrativo,
          linha: v.linha,
          is_prefixo: false,
        },
        { onConflict: "conta,demonstrativo" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra salva e reutilizada nos próximos fechamentos.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const valorTotal = (pendencias.data ?? []).reduce((a, c) => a + Number(c.valor ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3">
        <div className="min-w-48">
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select
            value={empresaId || "todas"}
            onValueChange={(v) => setEmpresaId(v === "todas" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {(empresas.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28">
          <label className="text-xs text-muted-foreground">Ano</label>
          <Input value={ano} onChange={(e) => setAno(e.target.value)} placeholder="Todos" />
        </div>
        <div className="w-24">
          <label className="text-xs text-muted-foreground">Mês</label>
          <Input value={mes} onChange={(e) => setMes(e.target.value)} placeholder="Todos" />
        </div>
        <Button
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["bp_dre_pendencias"] })}
        >
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
            Valor em contas não mapeadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="num text-2xl font-semibold">{formatBRL(valorTotal)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas sem De/Para no BP/DRE</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[30rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Conta</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Lançamentos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Demonstrativo</th>
                  <th className="px-3 py-2 text-left font-medium">Linha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(pendencias.data ?? []).map((p) => {
                  const atual = novaLinha[p.conta] ?? { demonstrativo: "BP", linha: "" };
                  return (
                    <tr key={p.conta} className="border-t border-border">
                      <td className="px-3 py-1.5 text-xs">{p.conta}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.descricao}</td>
                      <td className="num px-3 py-1.5 text-right">{p.qtd}</td>
                      <td className="num px-3 py-1.5 text-right">{formatBRL(Number(p.valor))}</td>
                      <td className="px-3 py-1.5">
                        <Select
                          value={atual.demonstrativo}
                          onValueChange={(v) =>
                            setNovaLinha({
                              ...novaLinha,
                              [p.conta]: { ...atual, demonstrativo: v },
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEMONSTRATIVOS.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 w-48"
                            placeholder="Linha do BP/DRE"
                            value={atual.linha}
                            onChange={(e) =>
                              setNovaLinha({
                                ...novaLinha,
                                [p.conta]: { ...atual, linha: e.target.value },
                              })
                            }
                          />
                          <Button
                            size="sm"
                            disabled={!atual.linha.trim()}
                            onClick={() =>
                              mapear.mutate({
                                conta: p.conta,
                                descricao: p.descricao,
                                demonstrativo: atual.demonstrativo,
                                linha: atual.linha.trim(),
                              })
                            }
                          >
                            Mapear
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!pendencias.data?.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma pendência de conta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
