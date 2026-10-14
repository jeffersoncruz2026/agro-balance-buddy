import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAmbienteEdicao } from "@/lib/ambiente";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Site publicado: os relatórios são abertos a visitantes (somente leitura).
      // No editor do Lovable o login continua obrigatório.
      if (isAmbienteEdicao()) throw redirect({ to: "/auth" });
      return { user: null };
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (perfil && perfil.status !== "aprovado") {
      throw redirect({ to: "/aguardando-aprovacao" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
