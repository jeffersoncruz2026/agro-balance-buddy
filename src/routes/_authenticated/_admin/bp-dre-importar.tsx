import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/balancete";
import { encontrarEmpresa, parseBalanceteContabil, type BalanceteContabilParse } from "@/lib/bpdre";
import { Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/bp-dre-importar")({
  head: () => ({
    meta: [
      { title: "Importar Balancete Contábil | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Upload do Balancete Contábil Analítico por empresa e período para o módulo BP/DRE.",
      },
      { property: "og:title", content: "Importar Balancete Contábil | Balancete Gerencial" },
      {
        property: "og:description",
        content: "Upload do Balancete Contábil Analítico por empresa/período.",
      },
    ],
  }),
  component: BpDreImportar,
});

const NOVA_EMPRESA = "__nova__";

function BpDreImportar() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<BalanceteContabilParse | null>(null);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [nomeNovaEmpresa, setNomeNovaEmpresa] = useState("");
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [progresso, setProgresso] = useState(0);

  const empresas = useQuery({
    queryKey: ["bp_dre_empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bp_dre_empresas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const historico = useQuery({
    queryKey: ["bp_dre_importacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bp_dre_importacoes")
        .select("*, bp_dre_empresas(nome)")
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
      const resultado = parseBalanceteContabil(buf);
      if (!resultado.linhas.length)
        throw new Error(
          "Nenhuma linha válida encontrada (verifique se o arquivo tem a aba do Balancete Contábil Analítico).",
        );
      setPrevia(resultado);
      setAno(resultado.ano);
      setMes(resultado.mes);
      const match = encontrarEmpresa(resultado.empresaDetectada, empresas.data ?? []);
      setEmpresaId(match ? match.id : "");
      setNomeNovaEmpresa(resultado.empresaDetectada ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a planilha");
    }
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (!previa || !arquivo) return;
      if (!ano || !mes) throw new Error("Informe o ano e o mês de competência.");
      let empresaIdFinal = empresaId;
      if (empresaIdFinal === NOVA_EMPRESA || !empresaIdFinal) {
        if (!nomeNovaEmpresa.trim()) throw new Error("Informe o nome da empresa.");
        const { data: nova, error: eEmpresa } = await supabase
          .from("bp_dre_empresas")
          .insert({ nome: nomeNovaEmpresa.trim() })
          .select()
          .single();
        if (eEmpresa) throw eEmpresa;
        empresaIdFinal = nova.id;
      }

      const { data: imp, error } = await supabase
        .from("bp_dre_importacoes")
        .insert({
          empresa_id: empresaIdFinal,
          ano,
          mes,
          arquivo: arquivo.name,
          total_linhas: previa.linhas.length,
        })
        .select()
        .single();
      if (error) throw error;

      const CHUNK = 1000;
      for (let i = 0; i < previa.linhas.length; i += CHUNK) {
        const lote = previa.linhas.slice(i, i + CHUNK).map((l) => ({
          ...l,
          importacao_id: imp.id,
          empresa_id: empresaIdFinal,
          ano,
          mes,
        }));
        const { error: e2 } = await supabase.from("bp_dre_lancamentos").insert(lote);
        if (e2) throw e2;
        setProgresso(Math.round(((i + CHUNK) / previa.linhas.length) * 100));
      }
      return imp;
    },
    onSuccess: () => {
      toast.success("Balancete contábil importado com sucesso.");
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
      const { error } = await supabase.from("bp_dre_importacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Importação removida (lançamentos excluídos).");
      qc.invalidateQueries();
    },
  });

  const empresaSelecionada = (empresas.data ?? []).find((e) => e.id === empresaId);
  const empresaDivergente =
    previa?.empresaDetectada &&
    empresaSelecionada &&
    !encontrarEmpresa(previa.empresaDetectada, [empresaSelecionada]);

  return (
    <AppLayout
      titulo="Importar Balancete Contábil"
      descricao="Upload do Balancete Contábil Analítico (Conta, Reduzido, Descrição, Anterior, Débitos, Créditos, Saldo Atual) por empresa e período."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">
              {arquivo ? arquivo.name : "Clique para selecionar o arquivo .xlsx/.xlsm"}
            </span>
            <span className="text-xs text-muted-foreground">
              Balancete Contábil Analítico de uma empresa
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])}
            />
          </label>

          {previa && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Linhas lidas</p>
                  <p className="num text-lg font-semibold">
                    {previa.linhas.length.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Soma Saldo Atual</p>
                  <p className="num text-lg font-semibold">
                    {formatBRL(previa.linhas.reduce((a, l) => a + l.saldo_atual, 0))}
                  </p>
                </div>
                {previa.periodoTexto && (
                  <div>
                    <p className="text-muted-foreground">Período no arquivo</p>
                    <p className="text-lg font-semibold">{previa.periodoTexto}</p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Empresa{" "}
                    {previa.empresaDetectada ? `(detectada: "${previa.empresaDetectada}")` : ""}
                  </label>
                  <Select value={empresaId || undefined} onValueChange={setEmpresaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {(empresas.data ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                      <SelectItem value={NOVA_EMPRESA}>+ Nova empresa</SelectItem>
                    </SelectContent>
                  </Select>
                  {(empresaId === NOVA_EMPRESA || !empresaId) && (
                    <Input
                      className="mt-2"
                      placeholder="Nome da nova empresa"
                      value={nomeNovaEmpresa}
                      onChange={(e) => setNomeNovaEmpresa(e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ano de competência</label>
                  <Input
                    type="number"
                    value={ano ?? ""}
                    onChange={(e) => setAno(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mês de competência</label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={mes ?? ""}
                    onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>

              {empresaDivergente && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                  A empresa selecionada não bate com o nome detectado no arquivo ("
                  {previa.empresaDetectada}"). Confira antes de importar.
                </p>
              )}
              {!previa.empresaDetectada && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                  Não foi possível detectar a empresa automaticamente — selecione ou cadastre
                  manualmente.
                </p>
              )}

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        "Conta",
                        "Reduzido",
                        "Descrição",
                        "Anterior",
                        "Débitos",
                        "Créditos",
                        "Saldo Atual",
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previa.linhas.slice(0, 8).map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5">{l.conta}</td>
                        <td className="px-3 py-1.5">{l.reduzido}</td>
                        <td className="max-w-64 truncate px-3 py-1.5">{l.descricao}</td>
                        <td className="num px-3 py-1.5 text-right">{formatBRL(l.anterior)}</td>
                        <td className="num px-3 py-1.5 text-right">{formatBRL(l.debitos)}</td>
                        <td className="num px-3 py-1.5 text-right">{formatBRL(l.creditos)}</td>
                        <td className="num px-3 py-1.5 text-right">{formatBRL(l.saldo_atual)}</td>
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
                  <th className="py-2 text-left font-medium">Empresa</th>
                  <th className="py-2 text-left font-medium">Período</th>
                  <th className="py-2 text-left font-medium">Arquivo</th>
                  <th className="py-2 text-right font-medium">Linhas</th>
                  <th className="py-2 text-right font-medium">Importado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historico.data.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-2">{i.bp_dre_empresas?.nome}</td>
                    <td className="num py-2">
                      {String(i.mes).padStart(2, "0")}/{i.ano}
                    </td>
                    <td className="py-2">{i.arquivo}</td>
                    <td className="num py-2 text-right">
                      {i.total_linhas.toLocaleString("pt-BR")}
                    </td>
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
