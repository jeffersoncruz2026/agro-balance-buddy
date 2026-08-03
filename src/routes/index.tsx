import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  // Precisa rodar só no cliente: o link de confirmação de e-mail do Supabase
  // devolve o usuário para "/" com o token de sessão na URL (fragmento
  // #access_token=... ou "?code=..."), que nunca chega ao servidor. Se essa
  // rota redirecionasse no servidor (SSR) antes do cliente processar a URL,
  // o token seria perdido e a confirmação pareceria falhar.
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/painel" : "/auth" });
  },
});
