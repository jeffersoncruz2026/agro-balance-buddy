import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Gate único do grupo Administrador: só quem tem papel 'admin' entra. */
export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: context.user.id,
      _role: "admin",
    });
    if (error || !data) throw redirect({ to: "/balancete-gerencial" });
  },
  component: () => <Outlet />,
});
