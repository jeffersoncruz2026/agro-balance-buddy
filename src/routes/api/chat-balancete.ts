import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayRunId,
} from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3.6-flash";
const PAGINA = 1000;
const MAX_LINHAS = 400;

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function criarSupabase(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase não configurado");

  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Supa = ReturnType<typeof criarSupabase>;

const SISTEMA = `Você é o assistente analítico do sistema "Resultados Gerenciais Grupo Otávio Lage".
Responda em português do Brasil, de forma objetiva, sobre o balancete gerencial: receitas, custos,
despesas administrativas (contas 3.4.01.*), despesas tributárias e de vendas, resultado financeiro
e ajustes gerenciais.

Regras obrigatórias:
- NUNCA invente números. Todo valor citado deve vir de uma ferramenta que você chamou nesta conversa.
- Se a consulta não retornar dados, diga claramente que não há dados para o período/filtro informado.
- Formate valores como R$ 1.234.567,89 (padrão brasileiro).
- O ano-safra vai de abril a março (safra 2026/2027 = abr/2026 até mar/2027).
- Quando útil, apresente os números em uma pequena tabela markdown e finalize com uma leitura curta do resultado.
- Você é somente leitura: não altera nem cadastra nada no sistema.`;

async function serieCompleta(supabase: Supa, ano: number, mes: number, meses: number) {
  const linhas: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .rpc("desp_adm_serie", { p_ano_ref: ano, p_mes_ref: mes, p_meses: meses })
      .range(offset, offset + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
    offset += PAGINA;
  }
  return linhas;
}

function limitar<T>(linhas: T[]) {
  if (linhas.length <= MAX_LINHAS) return { linhas, truncado: false, total: linhas.length };
  return { linhas: linhas.slice(0, MAX_LINHAS), truncado: true, total: linhas.length };
}

function criarFerramentas(supabase: Supa) {
  return {
    despesas_adm_resumo: tool({
      description:
        "Série mensal de despesas administrativas (contas 3.4.01.*) agregada por mês, coligada, departamento, centro de custo e conta contábil. Use para totais, comparações entre meses e maiores rubricas.",
      inputSchema: z.object({
        ano_referencia: z.number().describe("Ano do mês mais recente da série"),
        mes_referencia: z.number().describe("Mês (1-12) mais recente da série"),
        meses: z.number().describe("Quantidade de meses retroativos, ex.: 1, 3, 13"),
        agrupar_por: z
          .enum(["mes", "conta", "centro_custo", "departamento", "coligada"])
          .describe("Dimensão de agrupamento do resumo"),
      }),
      execute: async ({ ano_referencia, mes_referencia, meses, agrupar_por }) => {
        const linhas = await serieCompleta(supabase, ano_referencia, mes_referencia, meses);
        const chave = (l: Record<string, unknown>) => {
          if (agrupar_por === "mes") return `${String(l["mes"]).padStart(2, "0")}/${l["ano"]}`;
          if (agrupar_por === "conta") return String(l["contacontabil"] ?? "(sem conta)");
          if (agrupar_por === "centro_custo") return String(l["nomecusto"] ?? "(sem centro)");
          if (agrupar_por === "departamento") return String(l["nomedepto"] ?? "(sem depto)");
          return String(l["nomecoligada"] ?? "(sem coligada)");
        };
        const mapa = new Map<string, number>();
        let total = 0;
        for (const l of linhas) {
          if (String(l["categoria"]) !== "DESP. ADM") continue;
          const v = Number(l["valor"] ?? 0);
          total += v;
          mapa.set(chave(l), (mapa.get(chave(l)) ?? 0) + v);
        }
        const itens = [...mapa.entries()]
          .map(([nome, valor]) => ({ nome, valor }))
          .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
        return { total, agrupado_por: agrupar_por, ...limitar(itens) };
      },
    }),

    despesas_adm_lancamentos: tool({
      description:
        "Lançamentos individuais de despesas administrativas de um mês específico, com filtros opcionais por departamento, centro de custo, coligada ou conta contábil.",
      inputSchema: z.object({
        ano: z.number(),
        mes: z.number(),
        nomedepto: z.string().nullable(),
        nomecusto: z.string().nullable(),
        nomecoligada: z.string().nullable(),
        contacontabil: z.string().nullable(),
      }),
      execute: async ({ ano, mes, nomedepto, nomecusto, nomecoligada, contacontabil }) => {
        const { data, error } = await supabase.rpc("desp_adm_lancamentos", {
          p_ano: ano,
          p_mes: mes,
          p_nomedepto: nomedepto,
          p_nomecusto: nomecusto,
          p_nomecoligada: nomecoligada,
          p_contacontabil: contacontabil,
        });
        if (error) throw new Error(error.message);
        const linhas = (data ?? []) as unknown as { vlcusto: number }[];
        const total = linhas.reduce((s, l) => s + Number(l.vlcusto ?? 0), 0);
        return { total, ...limitar(linhas) };
      },
    }),

    balancete_periodo: tool({
      description:
        "Balancete gerencial de um mês: valores por categoria (RECEITA BRUTA, DESP. ADM, DESP. TRIBUT, custos etc.) e por linha de negócio, já com rateios e ajustes aplicados.",
      inputSchema: z.object({ ano: z.number(), mes: z.number() }),
      execute: async ({ ano, mes }) => {
        const { data, error } = await supabase.rpc("balancete", { p_ano: ano, p_mes: mes });
        if (error) throw new Error(error.message);
        return limitar((data ?? []) as unknown as Record<string, unknown>[]);
      },
    }),

    balancete_detalhe: tool({
      description:
        "Lançamentos que compõem uma célula do balancete gerencial (mês, safra, linha de negócio e categoria).",
      inputSchema: z.object({
        ano: z.number(),
        mes: z.number(),
        safra: z.number(),
        linha: z.string(),
        categoria: z.string(),
      }),
      execute: async ({ ano, mes, safra, linha, categoria }) => {
        const { data, error } = await supabase.rpc("balancete_detalhe", {
          p_ano: ano,
          p_mes: mes,
          p_safra: safra,
          p_linha: linha,
          p_categoria: categoria,
        });
        if (error) throw new Error(error.message);
        const linhas = (data ?? []) as unknown as { vlcusto: number }[];
        const total = linhas.reduce((s, l) => s + Number(l.vlcusto ?? 0), 0);
        return { total, ...limitar(linhas) };
      },
    }),

    resultado_financeiro: tool({
      description: "Resultado financeiro do ano-safra, por mês, categoria e conta.",
      inputSchema: z.object({ safra_ano: z.number().describe("Ano inicial da safra, ex.: 2026") }),
      execute: async ({ safra_ano }) => {
        const { data, error } = await supabase.rpc("resultado_financeiro", {
          p_safra_ano: safra_ano,
        });
        if (error) throw new Error(error.message);
        return limitar((data ?? []) as unknown as Record<string, unknown>[]);
      },
    }),

    ajustes_gerenciais: tool({
      description:
        "Ajustes manuais lançados no balancete gerencial (categoria, linha de negócio, mês, safra, valor e motivo).",
      inputSchema: z.object({
        safra_ano: z.number().nullable(),
        mes: z.number().nullable(),
        categoria: z.string().nullable(),
      }),
      execute: async ({ safra_ano, mes, categoria }) => {
        let q = supabase
          .from("ajustes")
          .select("categoria, linha_negocio, safra_ano, mes, valor, descricao, user_email")
          .order("safra_ano", { ascending: false })
          .limit(MAX_LINHAS);
        if (safra_ano !== null) q = q.eq("safra_ano", safra_ano);
        if (mes !== null) q = q.eq("mes", mes);
        if (categoria !== null) q = q.eq("categoria", categoria);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const linhas = data ?? [];
        const total = linhas.reduce((s, l) => s + Number(l.valor ?? 0), 0);
        return { total, linhas, quantidade: linhas.length };
      },
    }),
  };
}

export const Route = createFileRoute("/api/chat-balancete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Não autorizado", { status: 401 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response("IA não configurada no projeto.", { status: 500 });
        }

        const body = (await request.json()) as { messages?: unknown; contexto?: unknown };
        if (!Array.isArray(body.messages)) {
          return new Response("Mensagens inválidas", { status: 400 });
        }

        const supabase = criarSupabase(token);
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claims?.claims?.sub) {
          return new Response("Não autorizado", { status: 401 });
        }

        const gateway = createLovableAiGatewayProvider(apiKey, getLovableAiGatewayRunId(request));

        const hoje = new Date();
        const contexto =
          typeof body.contexto === "string" && body.contexto.length < 500 ? body.contexto : "";

        const result = streamText({
          model: gateway(MODEL),
          system: `${SISTEMA}\n\nData atual: ${hoje.toISOString().slice(0, 10)}.${
            contexto ? `\nFiltros atualmente selecionados na tela: ${contexto}` : ""
          }`,
          messages: convertToModelMessages(body.messages as UIMessage[]),
          tools: criarFerramentas(supabase),
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
          onError: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("429")) {
              return "Muitas solicitações à IA agora. Tente novamente em instantes.";
            }
            if (message.includes("402")) {
              return "Os créditos de IA do workspace acabaram. Adicione créditos para continuar.";
            }
            return `Erro ao consultar a IA: ${message}`;
          },
        });
      },
    },
  },
});
