import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIAS, LINHAS, formatBRL, sugerirLinha } from "@/lib/balancete";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({
    meta: [
      { title: "Pendências | Balancete Gerencial" },
      { name: "description", content: "Contas contábeis e produtos sem De/Para cadastrado, com o valor total ainda não classificado." },
      { property: "og:title", content: "Pendências | Balancete Gerencial" },
      { property: "og:description", content: "Resolva as classificações pendentes antes de gerar o balancete." },
    ],
  }),
  component: Pendencias,
});

function Pendencias() {
  const qc = useQueryClient();

  const contas = useQuery({
    queryKey: ["pend_contas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pendencias_contas");
      if (error) throw error;
      return data;
    },
  });

  const produtos = useQuery({
    queryKey: ["pend_produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pendencias_produtos");
      if (error) throw error;
      return data;
    },
  });

  const mapearConta = useMutation({
    mutationFn: async (v: { conta: string; descricao: string | null; categoria: string }) => {
      const { error } = await supabase
        .from("conta_map")
        .upsert(
          { conta: v.conta, descricao: v.descricao, categoria: v.categoria, is_prefixo: false },
          { onConflict: "conta" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra salva e reutilizada nos próximos meses.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const mapearProduto = useMutation({
    mutationFn: async (v: { produto: string; linha_negocio: string }) => {
      const { error } = await supabase.from("produto_map").upsert(v, { onConflict: "produto" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Linha de negócio definida.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const valorContas = (contas.data ?? []).reduce((a, c) => a + Number(c.valor ?? 0), 0);
  const valorProdutos = (produtos.data ?? []).reduce((a, c) => a + Number(c.valor ?? 0), 0);

  return (
    <AppLayout
      titulo="Pendências de classificação"
      descricao={`${contas.data?.length ?? 0} contas e ${produtos.data?.length ?? 0} produtos sem De/Para — nada é ignorado silenciosamente.`}
      acoes={
        <Button variant="outline" onClick={() => qc.invalidateQueries()}>
          Atualizar
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
              Valor em contas não mapeadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold">{formatBRL(valorContas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
              Valor em produtos sem linha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="num text-2xl font-semibold">{formatBRL(valorProdutos)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Contas contábeis sem categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[30rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Conta</th>
                  <th className="px-3 py-2 text-right font-medium">Lançamentos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Classificar como</th>
                </tr>
              </thead>
              <tbody>
                {(contas.data ?? []).map((c) => (
                  <tr key={c.vcodconta} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{c.contacontabil ?? c.vcodconta}</td>
                    <td className="num px-3 py-1.5 text-right">{c.qtd}</td>
                    <td className="num px-3 py-1.5 text-right">{formatBRL(Number(c.valor))}</td>
                    <td className="px-3 py-1.5">
                      <Select
                        onValueChange={(v) =>
                          mapearConta.mutate({
                            conta: c.vcodconta ?? "",
                            descricao: c.contacontabil,
                            categoria: v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-64">
                          <SelectValue placeholder="Selecionar categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
                {!contas.data?.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma pendência de conta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Produtos sem linha de negócio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[30rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Produto</th>
                  <th className="px-3 py-2 text-left font-medium">Exemplo de unidade</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Linha de negócio</th>
                </tr>
              </thead>
              <tbody>
                {(produtos.data ?? []).map((p) => {
                  const sugestao = sugerirLinha(`${p.produto ?? ""} ${p.exemplo_depto ?? ""}`);
                  return (
                    <tr key={p.produto} className="border-t border-border">
                      <td className="max-w-96 truncate px-3 py-1.5 text-xs">{p.produto}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {p.exemplo_depto}
                      </td>
                      <td className="num px-3 py-1.5 text-right">{formatBRL(Number(p.valor))}</td>
                      <td className="px-3 py-1.5">
                        <Select
                          onValueChange={(v) =>
                            mapearProduto.mutate({ produto: p.produto ?? "", linha_negocio: v })
                          }
                        >
                          <SelectTrigger className="h-8 w-56">
                            <SelectValue
                              placeholder={sugestao ? `Sugestão: ${sugestao}` : "Selecionar"}
                            />
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
                    </tr>
                  );
                })}
                {!produtos.data?.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma pendência de produto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
