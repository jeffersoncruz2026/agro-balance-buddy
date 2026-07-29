import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LINHAS, MESES, PREFIXO_ADM, CCUSTO_ADM_OUTROS, formatBRL, safraLabel } from "@/lib/balancete";


export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Balancete Gerencial" },
      { name: "description", content: "Defina o mês de início do ano-safra usado na comparação entre safras do balancete gerencial." },
      { property: "og:title", content: "Configurações do Balancete Gerencial" },
      { property: "og:description", content: "Mês de início do ano-safra e preferências do fechamento mensal." },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(4);

  const { data } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data?.safra_start_month) setMes(data.safra_start_month);
  }, [data?.safra_start_month]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ id: true, safra_start_month: mes }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const anoEx = new Date().getFullYear();

  return (
    <AppLayout titulo="Configurações" descricao="Parâmetros globais do fechamento gerencial.">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Ano-safra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Mês de início da safra</label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Lançamentos a partir de {MESES[mes - 1]}/{anoEx} pertencem à safra{" "}
            <span className="font-medium text-foreground">{safraLabel(anoEx)}</span>; meses
            anteriores pertencem à safra {safraLabel(anoEx - 1)}.
          </p>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Como o balancete é montado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. A base bruta do mês é importada e armazenada por lançamento.</p>
          <p>
            2. O De/Para classifica cada lançamento em categoria (pela conta contábil, com suporte a
            prefixo) e em linha de negócio (pelo produto).
          </p>
          <p>
            3. RECEITA LÍQUIDA = RECEITA BRUTA − devoluções, ICMS, PIS, COFINS, INSS rural e outros
            abatimentos.
          </p>
          <p>
            4. DESP. ADM, TRIBUT e VENDAS são rateadas para as linhas conforme o percentual manual
            informado a cada mês na tela do balancete.
          </p>
          <p>5. O relatório é sempre consolidado, comparando a safra atual com a anterior.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
