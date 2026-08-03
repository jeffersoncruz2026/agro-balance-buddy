import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/aguardando-aprovacao")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Aguardando aprovação | Balancete Gerencial" }],
  }),
  component: AguardandoAprovacao,
});

function AguardandoAprovacao() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pendente" | "rejeitado" | null>(null);

  useEffect(() => {
    let ativo = true;
    async function checar() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: perfil } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!ativo) return;
      if (perfil?.status === "aprovado") {
        navigate({ to: "/painel" });
        return;
      }
      setStatus((perfil?.status as "pendente" | "rejeitado") ?? "pendente");
    }
    checar();
    return () => {
      ativo = false;
    };
  }, [navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const rejeitado = status === "rejeitado";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        {rejeitado ? (
          <XCircle className="mx-auto size-10 text-destructive" />
        ) : (
          <Clock3 className="mx-auto size-10 text-muted-foreground" />
        )}
        <h1 className="mt-4 font-display text-xl font-semibold">
          {rejeitado ? "Cadastro não aprovado" : "Aguardando aprovação"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rejeitado
            ? "Seu cadastro foi analisado e não foi aprovado. Fale com um administrador para mais detalhes."
            : "Seu cadastro está aguardando aprovação de um administrador. Você receberá acesso assim que for aprovado."}
        </p>
        <Button variant="outline" className="mt-6" onClick={sair}>
          Sair
        </Button>
      </div>
    </main>
  );
}
