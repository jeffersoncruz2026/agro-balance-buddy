import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAmbienteEdicao } from "@/lib/ambiente";

/**
 * Gate único do grupo Administrador: só quem tem papel 'admin' entra, e apenas
 * no ambiente de edição (Lovable) — no site publicado as telas ficam bloqueadas.
 */
export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: async ({ context }) => {
    if (!isAmbienteEdicao() || !context.user) throw redirect({ to: "/balancete-gerencial" });
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: context.user.id,
      _role: "admin",
    });
    if (error || !data) throw redirect({ to: "/balancete-gerencial" });
  },
  component: () => <Outlet />,
});
