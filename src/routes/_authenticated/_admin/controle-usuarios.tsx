import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/controle-usuarios")({
  head: () => ({
    meta: [{ title: "Controle de Usuários | Balancete Gerencial" }],
  }),
  component: ControleUsuarios,
});

function ControleUsuarios() {
  const qc = useQueryClient();

  const perfis = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, nome, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const atualizarStatus = useMutation({
    mutationFn: async (v: { id: string; status: "aprovado" | "rejeitado" }) => {
      const { error } = await supabase.from("profiles").update({ status: v.status }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_data, v) => {
      toast.success(v.status === "aprovado" ? "Cadastro aprovado." : "Cadastro rejeitado.");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const pendentes = (perfis.data ?? []).filter((p) => p.status === "pendente");
  const historico = (perfis.data ?? []).filter((p) => p.status !== "pendente");

  return (
    <AppLayout
      titulo="Controle de Usuários"
      descricao="Aprove ou rejeite novos cadastros e acompanhe o histórico de decisões."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastros pendentes ({pendentes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">E-mail</th>
                  <th className="px-3 py-2 text-left font-medium">Cadastrado em</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{p.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email}</td>
                    <td className="num px-3 py-2 text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={atualizarStatus.isPending}
                          onClick={() => atualizarStatus.mutate({ id: p.id, status: "aprovado" })}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={atualizarStatus.isPending}
                          onClick={() => atualizarStatus.mutate({ id: p.id, status: "rejeitado" })}
                        >
                          Rejeitar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!pendentes.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum cadastro pendente.
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
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">E-mail</th>
                  <th className="px-3 py-2 text-left font-medium">Cadastrado em</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{p.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email}</td>
                    <td className="num px-3 py-2 text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={p.status === "aprovado" ? "default" : "destructive"}>
                        {p.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!historico.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum histórico ainda.
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
