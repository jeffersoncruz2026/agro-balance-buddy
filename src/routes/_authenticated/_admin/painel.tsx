import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, LINHAS, MESES } from "@/lib/balancete";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/_admin/painel")({
  head: () => ({
    meta: [
      { title: "Painel | Balancete Gerencial" },
      { name: "description", content: "Visão geral das bases importadas, pendências de De/Para e evolução do resultado por linha de negócio." },
      { property: "og:title", content: "Painel | Balancete Gerencial" },
      { property: "og:description", content: "Visão geral das bases importadas, pendências e evolução do resultado." },
    ],
  }),
  component: Painel,
});

const CORES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

function Painel() {
  const resumo = useQuery({
    queryKey: ["resumo"],
    queryFn: async () => {
      const [lanc, imps, pc, pp] = await Promise.all([
        supabase.from("lancamentos").select("id", { count: "exact", head: true }),
        supabase.from("importacoes").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.rpc("pendencias_contas"),
        supabase.rpc("pendencias_produtos"),
      ]);
      const contas = pc.data ?? [];
      const produtos = pp.data ?? [];
      return {
        totalLancamentos: lanc.count ?? 0,
        importacoes: imps.data ?? [],
        contasPend: contas.length,
        produtosPend: produtos.length,
        valorPend:
          contas.reduce((a, c) => a + Number(c.valor ?? 0), 0) ,
      };
    },
  });

  const evolucao = useQuery({
    queryKey: ["evolucao"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("evolucao_saldo");
      if (error) throw error;
      const mapa = new Map<string, Record<string, number | string>>();
      for (const r of data ?? []) {
        if (r.categoria === "NÃO MAPEADO" || r.categoria === "NÃO CLASSIFICAR / IGNORAR") continue;
        const chave = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
        if (!mapa.has(chave)) mapa.set(chave, { periodo: `${MESES[r.mes - 1].slice(0, 3)}/${r.ano}`, ordem: chave });
        const item = mapa.get(chave)!;
        const linha = LINHAS.includes(r.linha as never) ? r.linha : "OUTROS";
        item[linha] = (Number(item[linha]) || 0) + Number(r.valor);
      }
      return [...mapa.values()].sort((a, b) => String(a.ordem).localeCompare(String(b.ordem))).slice(-12);
    },
  });

  const cards = [
    { titulo: "Lançamentos na base", valor: (resumo.data?.totalLancamentos ?? 0).toLocaleString("pt-BR") },
    { titulo: "Contas sem De/Para", valor: String(resumo.data?.contasPend ?? 0) },
    { titulo: "Produtos sem linha", valor: String(resumo.data?.produtosPend ?? 0) },
    { titulo: "Valor não classificado", valor: formatBRL(resumo.data?.valorPend ?? 0) },
  ];

  return (
    <AppLayout
      titulo="Painel"
      descricao="Situação da base, pendências de classificação e evolução do resultado."
      acoes={
        <Button asChild>
          <Link to="/balancete">Gerar balancete</Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.titulo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {c.titulo}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="num text-2xl font-semibold">{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Resultado por linha de negócio (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {evolucao.data && evolucao.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {LINHAS.map((l, i) => (
                  <Line key={l} type="monotone" dataKey={l} stroke={CORES[i]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum dado ainda. Importe uma base para começar.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Últimas importações</CardTitle>
        </CardHeader>
        <CardContent>
          {resumo.data?.importacoes.length ? (
            <ul className="divide-y divide-border text-sm">
              {resumo.data.importacoes.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span className="truncate">{i.arquivo}</span>
                  <span className="num text-muted-foreground">
                    {i.total_linhas.toLocaleString("pt-BR")} linhas ·{" "}
                    {new Date(i.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma base importada.</p>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
