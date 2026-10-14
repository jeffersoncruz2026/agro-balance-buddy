import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Indica se há um usuário logado (no site publicado, visitantes navegam sem login). */
export function useLogado() {
  return useQuery({
    queryKey: ["logado"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    },
  });
}
