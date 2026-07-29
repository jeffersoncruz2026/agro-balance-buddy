import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CATEGORIAS, LINHAS } from "@/lib/balancete";
import { exportarPlanilha, lerPlanilhaSimples } from "@/lib/excel";
import { Trash2, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/depara")({
  head: () => ({
    meta: [
      { title: "De/Para | Balancete Gerencial" },
      { name: "description", content: "Gestão do mapeamento de contas contábeis para categorias e de produtos para linhas de negócio." },
      { property: "og:title", content: "De/Para | Balancete Gerencial" },
      { property: "og:description", content: "Mapeamento de contas e produtos reutilizado todo mês." },
    ],
  }),
  component: DePara,
});

function DePara() {
  return (
    <AppLayout
      titulo="De/Para"
      descricao="Regras reutilizadas em todo fechamento. Contas aceitam mapeamento por prefixo."
    >
      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas contábeis</TabsTrigger>
          <TabsTrigger value="produtos">Produtos / Linha de negócio</TabsTrigger>
        </TabsList>
        <TabsContent value="contas" className="mt-4">
          <Contas />
        </TabsContent>
        <TabsContent value="produtos" className="mt-4">
          <Produtos />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function Contas() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState({
    conta: "",
    descricao: "",
    is_prefixo: true,
    categoria: CATEGORIAS[0] as string,
  });

  const { data } = useQuery({
    queryKey: ["conta_map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conta_map").select("*").order("conta");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async (row: {
      conta: string;
      categoria: string;
      descricao: string | null;
      is_prefixo: boolean;
    }) => {
      const { error } = await supabase.from("conta_map").upsert(row, { onConflict: "conta" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conta_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const filtradas = useMemo(
    () =>
      (data ?? []).filter((r) =>
        `${r.conta} ${r.descricao ?? ""} ${r.categoria}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [data, busca],
  );

  async function importarArquivo(file: File) {
    const rows = lerPlanilhaSimples(await file.arrayBuffer());
    const payload = rows
      .map((r) => {
        const conta = String(r["conta"] ?? r["CONTA"] ?? r["vcodconta"] ?? "").trim();
        const categoria = String(r["categoria"] ?? r["CATEGORIA"] ?? "").trim().toUpperCase();
        if (!conta || !CATEGORIAS.includes(categoria as never)) return null;
        return {
          conta,
          categoria,
          descricao: String(r["descricao"] ?? r["DESCRICAO"] ?? "") || null,
          is_prefixo: String(r["is_prefixo"] ?? r["PREFIXO"] ?? "").toLowerCase() === "true",
        };
      })
      .filter(Boolean);
    if (!payload.length) return toast.error("Nenhuma linha válida (colunas: conta, categoria).");
    const { error } = await supabase
      .from("conta_map")
      .upsert(payload as never[], { onConflict: "conta" });
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} regras importadas.`);
    qc.invalidateQueries();
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-40 flex-1">
            <label className="text-xs text-muted-foreground">Conta ou prefixo</label>
            <Input
              value={nova.conta}
              onChange={(e) => setNova({ ...nova, conta: e.target.value })}
              placeholder="4.1.01"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Input
              value={nova.descricao}
              onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
            />
          </div>
          <div className="min-w-56">
            <label className="text-xs text-muted-foreground">Categoria</label>
            <Select
              value={nova.categoria}
              onValueChange={(v) => setNova({ ...nova, categoria: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              salvar.mutate({ ...nova, descricao: nova.descricao || null });
              setNova({ ...nova, conta: "", descricao: "" });
            }}
          >
            Adicionar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Buscar conta ou categoria..."
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
                  descricao: r.descricao,
                  is_prefixo: r.is_prefixo,
                  categoria: r.categoria,
                })),
                "depara_contas.xlsx",
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
                <th className="px-3 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-left font-medium">Prefixo</th>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="num px-3 py-1.5">{r.conta}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.descricao}</td>
                  <td className="px-3 py-1.5">
                    <Switch
                      checked={r.is_prefixo}
                      onCheckedChange={(v) =>
                        salvar.mutate({ conta: r.conta, categoria: r.categoria, descricao: r.descricao, is_prefixo: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={r.categoria}
                      onValueChange={(v) =>
                        salvar.mutate({ conta: r.conta, categoria: v, descricao: r.descricao, is_prefixo: r.is_prefixo })
                      }
                    >
                      <SelectTrigger className="h-8 w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remover.mutate(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Produtos() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState({ produto: "", linha_negocio: LINHAS[0] as string });

  const { data } = useQuery({
    queryKey: ["produto_map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_map").select("*").order("produto");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async (row: { produto: string; linha_negocio: string }) => {
      const { error } = await supabase.from("produto_map").upsert(row, { onConflict: "produto" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produto_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const filtrados = useMemo(
    () =>
      (data ?? []).filter((r) =>
        `${r.produto} ${r.linha_negocio}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [data, busca],
  );

  async function importarArquivo(file: File) {
    const rows = lerPlanilhaSimples(await file.arrayBuffer());
    const payload = rows
      .map((r) => {
        const produto = String(r["produto"] ?? r["PRODUTO"] ?? "").trim();
        const linha = String(r["linha_negocio"] ?? r["LINHA"] ?? "").trim().toUpperCase();
        if (!produto || !LINHAS.includes(linha as never)) return null;
        return { produto, linha_negocio: linha };
      })
      .filter(Boolean);
    if (!payload.length)
      return toast.error("Nenhuma linha válida (colunas: produto, linha_negocio).");
    const { error } = await supabase
      .from("produto_map")
      .upsert(payload as never[], { onConflict: "produto" });
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} regras importadas.`);
    qc.invalidateQueries();
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-60 flex-1">
            <label className="text-xs text-muted-foreground">Produto (texto da base)</label>
            <Input
              value={novo.produto}
              onChange={(e) => setNovo({ ...novo, produto: e.target.value })}
            />
          </div>
          <div className="min-w-56">
            <label className="text-xs text-muted-foreground">Linha de negócio</label>
            <Select
              value={novo.linha_negocio}
              onValueChange={(v) => setNovo({ ...novo, linha_negocio: v })}
            >
              <SelectTrigger>
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
            onClick={() => {
              if (!novo.produto.trim()) return toast.error("Informe o produto.");
              salvar.mutate(novo);
              setNovo({ ...novo, produto: "" });
            }}
          >
            Adicionar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Buscar produto..."
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
                (data ?? []).map((r) => ({ produto: r.produto, linha_negocio: r.linha_negocio })),
                "depara_produtos.xlsx",
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
          <span className="text-xs text-muted-foreground">{filtrados.length} regras</span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-left font-medium">Linha de negócio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-xs">{r.produto}</td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={r.linha_negocio}
                      onValueChange={(v) => salvar.mutate({ produto: r.produto, linha_negocio: v })}
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
                  <td className="px-3 py-1.5 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remover.mutate(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
