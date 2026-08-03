import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { parseBase, type LinhaBase } from "@/lib/excel";
import { formatBRL, sugerirLinha } from "@/lib/balancete";
import { Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/importar")({
  head: () => ({
    meta: [
      { title: "Importar base | Balancete Gerencial" },
      { name: "description", content: "Upload mensal da base bruta do ERP em .xlsx com pré-visualização antes de confirmar." },
      { property: "og:title", content: "Importar base | Balancete Gerencial" },
      { property: "og:description", content: "Upload mensal da base bruta do ERP com pré-visualização." },
    ],
  }),
  component: Importar,
});

function Importar() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<{
    linhas: LinhaBase[];
    ignoradas: number;
    colunasNaoEncontradas: string[];
  } | null>(null);
  const [progresso, setProgresso] = useState(0);

  const historico = useQuery({
    queryKey: ["importacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function escolher(file: File) {
    setArquivo(file);
    setPrevia(null);
    try {
      const buf = await file.arrayBuffer();
      const resultado = parseBase(buf);
      if (!resultado.linhas.length) throw new Error("Nenhuma linha válida encontrada.");
      setPrevia(resultado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a planilha");
    }
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (!previa || !arquivo) return;
      const total = previa.linhas.reduce((a, l) => a + l.vlcusto, 0);
      const { data: imp, error } = await supabase
        .from("importacoes")
        .insert({
          arquivo: arquivo.name,
          total_linhas: previa.linhas.length,
          total_valor: total,
          status: "concluida",
        })
        .select()
        .single();
      if (error) throw error;

      const CHUNK = 1000;
      for (let i = 0; i < previa.linhas.length; i += CHUNK) {
        const lote = previa.linhas
          .slice(i, i + CHUNK)
          .map((l) => ({ ...l, importacao_id: imp.id }));
        const { error: e2 } = await supabase.from("lancamentos").insert(lote);
        if (e2) throw e2;
        setProgresso(Math.round(((i + CHUNK) / previa.linhas.length) * 100));
      }

      // Sugestões automáticas de linha de negócio para produtos novos
      const produtos = [...new Set(previa.linhas.map((l) => `${l.produto ?? ""}|${l.nomedepto ?? ""}`))];
      const sugestoes = produtos
        .map((p) => {
          const [produto, depto] = p.split("|");
          const linha = sugerirLinha(`${produto} ${depto}`);
          return linha && produto ? { produto, linha_negocio: linha } : null;
        })
        .filter(Boolean) as { produto: string; linha_negocio: string }[];
      if (sugestoes.length) {
        await supabase.from("produto_map").upsert(sugestoes, {
          onConflict: "produto",
          ignoreDuplicates: true,
        });
      }
      return imp;
    },
    onSuccess: () => {
      toast.success("Base importada com sucesso.");
      setArquivo(null);
      setPrevia(null);
      setProgresso(0);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na importação"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("importacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Importação removida (lançamentos excluídos).");
      qc.invalidateQueries();
    },
  });

  return (
    <AppLayout
      titulo="Importar base"
      descricao="Envie o .xlsx exportado do ERP. As colunas são reconhecidas mesmo fora de ordem."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">
              {arquivo ? arquivo.name : "Clique para selecionar o arquivo .xlsx"}
            </span>
            <span className="text-xs text-muted-foreground">Planilha única exportada do ERP</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])}
            />
          </label>

          {previa && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Linhas válidas</p>
                  <p className="num text-lg font-semibold">
                    {previa.linhas.length.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sem data (ignoradas)</p>
                  <p className="num text-lg font-semibold">{previa.ignoradas}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Soma VLCUSTO</p>
                  <p className="num text-lg font-semibold">
                    {formatBRL(previa.linhas.reduce((a, l) => a + l.vlcusto, 0))}
                  </p>
                </div>
              </div>

              {previa.colunasNaoEncontradas.length > 0 && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                  Colunas não encontradas na planilha:{" "}
                  {previa.colunasNaoEncontradas.join(", ").toUpperCase()}
                </p>
              )}

              {previa.linhas.every((l) => !l.codtmv) && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                  A coluna CODTMV não veio preenchida. Sem ela, os lançamentos da conta
                  3.4.01.10.0003 com CODTMV 1.2.13 não são identificados e entram no rateio em vez
                  de ir 100% para OUTROS.
                </p>
              )}

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {["DATA", "COLIGADA", "DEPTO", "PRODUTO", "CONTA", "VLCUSTO"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previa.linhas.slice(0, 8).map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5">
                          {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-1.5">{l.nomecoligada}</td>
                        <td className="px-3 py-1.5">{l.nomedepto}</td>
                        <td className="max-w-48 truncate px-3 py-1.5">{l.produto}</td>
                        <td className="px-3 py-1.5">{l.vcodconta}</td>
                        <td className="num px-3 py-1.5 text-right">{formatBRL(l.vlcusto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importar.isPending && <Progress value={progresso} />}

              <Button onClick={() => importar.mutate()} disabled={importar.isPending}>
                {importar.isPending ? `Importando... ${progresso}%` : "Confirmar importação"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Histórico de importações</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.data?.length ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Arquivo</th>
                  <th className="py-2 text-right font-medium">Linhas</th>
                  <th className="py-2 text-right font-medium">Soma</th>
                  <th className="py-2 text-right font-medium">Data</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historico.data.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-2">{i.arquivo}</td>
                    <td className="num py-2 text-right">
                      {i.total_linhas.toLocaleString("pt-BR")}
                    </td>
                    <td className="num py-2 text-right">{formatBRL(Number(i.total_valor))}</td>
                    <td className="num py-2 text-right">
                      {new Date(i.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => excluir.mutate(i.id)}
                        aria-label="Excluir importação"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma importação registrada.</p>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
