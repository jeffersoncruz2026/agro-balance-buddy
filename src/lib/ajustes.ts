import { supabase } from "@/integrations/supabase/client";

/**
 * Colunas de `ajustes` para leitura. Visitantes sem login (site publicado) não têm
 * acesso às colunas de usuário, então o e-mail só é pedido quando há sessão.
 */
export async function colunasAjustes(): Promise<string> {
  const base = "id, categoria, linha_negocio, safra_ano, mes, valor, descricao, created_at";
  const { data } = await supabase.auth.getSession();
  return data.session ? `${base}, user_email` : base;
}
