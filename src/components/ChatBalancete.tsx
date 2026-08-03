import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { BarChart3, RotateCcw } from "lucide-react";

const STORAGE_KEY = "chat-balancete-mensagens-v1";

function carregarMensagens(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY);
    const dados: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(dados) ? (dados as UIMessage[]) : [];
  } catch {
    return [];
  }
}

type Props = {
  contexto?: string;
  sugestoes?: string[];
};

export function ChatBalancete({ contexto, sugestoes = [] }: Props) {
  const [iniciais] = useState<UIMessage[]>(() => carregarMensagens());
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextoRef = useRef(contexto);
  contextoRef.current = contexto;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat-balancete",
        headers: (async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        }) as unknown as Record<string, string>,
        body: () => ({ contexto: contextoRef.current }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: "balancete",
    messages: iniciais,
    transport,
    onError: (e) => setErro(e.message || "Falha ao consultar a IA."),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  const ocupado = status === "submitted" || status === "streaming";

  const enviar = useCallback(
    (valor: string) => {
      const pergunta = valor.trim();
      if (!pergunta || ocupado) return;
      setErro(null);
      setTexto("");
      void sendMessage({ text: pergunta });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [ocupado, sendMessage],
  );

  const limpar = () => {
    setMessages([]);
    setErro(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    textareaRef.current?.focus();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-4 text-primary" />
          Perguntas sobre as despesas
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={limpar} disabled={!messages.length}>
          <RotateCcw className="size-4" />
          Nova conversa
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Conversation className="h-[26rem] rounded-md border border-border/60">
          <ConversationContent>
            {messages.length === 0 && (
              <ConversationEmptyState
                title="Pergunte sobre o balancete gerencial"
                description="Ex.: totais de DESP. ADM, maiores contas do mês, comparação entre períodos, ajustes manuais."
              />
            )}
            {messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent
                  className={m.role === "assistant" ? "bg-transparent p-0 text-foreground" : ""}
                >
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      ) : (
                        <span key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const p = part as unknown as {
                        type: string;
                        state: Parameters<typeof ToolHeader>[0]["state"];
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      return (
                        <Tool defaultOpen={false} key={i}>
                          <ToolHeader
                            type={p.type.replace("tool-", "Consulta: ") as `tool-${string}`}
                            state={p.state}
                          />
                          <ToolContent>
                            <ToolInput input={p.input} />
                            <ToolOutput
                              errorText={p.errorText}
                              output={
                                p.output ? (
                                  <pre className="overflow-x-auto text-xs">
                                    {JSON.stringify(p.output, null, 2).slice(0, 4000)}
                                  </pre>
                                ) : undefined
                              }
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))}
            {status === "submitted" && <Shimmer>Consultando os dados...</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {messages.length === 0 && sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => enviar(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        <PromptInput
          onSubmit={(_message, event) => {
            event.preventDefault();
            enviar(texto);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: qual o total de despesas administrativas em junho/2026?"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!texto.trim() && !ocupado} />
          </PromptInputFooter>
        </PromptInput>
      </CardContent>
    </Card>
  );
}
