import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS,
  LINHAS,
  MESES,
  formatBRL,
  safraDe,
  safraLabel,
} from "@/lib/balancete";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes Gerenciais | Balancete" },
      {
        name: "description",
        content:
          "Lançamentos manuais de ajuste (+/-) por categoria e linha de negócio, com motivo, autor e data para auditoria.",
      },
      { property: "og:title", content: "Ajustes Gerenciais do Balancete" },
      {
        property: "og:description",
        content: "Cadastre, edite e audite ajustes manuais aplicados ao balancete gerencial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ajustes,
});

const hoje = new Date();

interface Form {
  id?: string;
  categoria: string;
  linha_negocio: string;
  safra_ano: number;
  mes: number;
  sinal: "+" | "-";
  valor: string;
  descricao: string;
}

function novoForm(safra: number): Form {
  return {
    categoria: CATEGORIAS[0],
    linha_negocio: LINHAS[0],
    safra_ano: safra,
    mes: hoje.getMonth() + 1,
    sinal: "+",
    valor: "",
    descricao: "",
  };
}

function Ajustes() {
  const qc = useQueryClient();

  const cfg = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const inicioSafra = cfg.data?.safra_start_month ?? 4;
  const safraPadrao = safraDe(hoje.getFullYear(), hoje.getMonth() + 1, inicioSafra);

  const [form, setForm] = useState<Form>(() => novoForm(safraPadrao));
  const [filtroSafra, setFiltroSafra] = useState<string>("todas");

  const mesesOrdem = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ((inicioSafra - 1 + i) % 12) + 1),
    [inicioSafra],
  );

  const lista = useQuery({
    queryKey: ["ajustes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ajustes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const salvar = useMutation({
    mutationFn: async (f: Form) => {
      const bruto = Number(String(f.valor).replace(/\./g, "").replace(",", "."));
      if (!bruto || Number.isNaN(bruto)) throw new Error("Informe um valor válido.");
      if (!f.descricao.trim()) throw new Error("A descrição (motivo) é obrigatória.");
      const valor = f.sinal === "-" ? -Math.abs(bruto) : Math.abs(bruto);
      const payload = {
        categoria: f.categoria,
        linha_negocio: f.linha_negocio,
        safra_ano: f.safra_ano,
        mes: f.mes,
        valor,
        descricao: f.descricao.trim(),
      };
      if (f.id) {
        const { error } = await supabase.from("ajustes").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("ajustes")
          .insert({ ...payload, user_email: auth.user?.email ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Ajuste salvo.");
      setForm(novoForm(safraPadrao));
      qc.invalidateQueries({ queryKey: ["ajustes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ajustes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajuste excluído.");
      qc.invalidateQueries({ queryKey: ["ajustes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = (lista.data ?? []).filter(
    (r) => filtroSafra === "todas" || r.safra_ano === Number(filtroSafra),
  );
  const totalFiltro = registros.reduce((a, r) => a + Number(r.valor), 0);

  const safrasDisponiveis = [...new Set((lista.data ?? []).map((r) => r.safra_ano))].sort(
    (a, b) => b - a,
  );

  return (
    <AppLayout
      titulo="Ajustes Gerenciais"
      descricao="Lançamentos manuais (+/-) somados ao valor apurado da base na geração do balancete."
    >
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {form.id ? "Editar ajuste" : "Novo ajuste"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Categoria</label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Linha de negócio</label>
              <Select
                value={form.linha_negocio}
                onValueChange={(v) => setForm((f) => ({ ...f, linha_negocio: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINHAS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Mês</label>
              <Select
                value={String(form.mes)}
                onValueChange={(v) => setForm((f) => ({ ...f, mes: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mesesOrdem.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {MESES[m - 1]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Ano-safra</label>
              <Select
                value={String(form.safra_ano)}
                onValueChange={(v) => setForm((f) => ({ ...f, safra_ano: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }, (_, i) => safraPadrao + 2 - i).map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {safraLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Sinal</label>
              <Select
                value={form.sinal}
                onValueChange={(v) => setForm((f) => ({ ...f, sinal: v as "+" | "-" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+">Positivo (+)</SelectItem>
                  <SelectItem value="-">Negativo (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Valor (R$)</label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>

            <div className="md:col-span-3 lg:col-span-6">
              <label className="text-xs text-muted-foreground">
                Descrição / motivo do ajuste (obrigatório)
              </label>
              <Textarea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex.: reclassificação de nota fiscal lançada no mês seguinte."
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => salvar.mutate(form)} disabled={salvar.isPending}>
              <Plus className="size-4" /> {form.id ? "Salvar alterações" : "Adicionar ajuste"}
            </Button>
            {form.id && (
              <Button variant="ghost" onClick={() => setForm(novoForm(safraPadrao))}>
                <X className="size-4" /> Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base">Ajustes lançados (auditoria)</CardTitle>
          <Select value={filtroSafra} onValueChange={setFiltroSafra}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as safras</SelectItem>
              {safrasDisponiveis.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {safraLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Período</th>
                  <th className="px-2 py-2 text-left font-medium">Categoria</th>
                  <th className="px-2 py-2 text-left font-medium">Linha</th>
                  <th className="px-2 py-2 text-left font-medium">Motivo</th>
                  <th className="px-2 py-2 text-left font-medium">Usuário</th>
                  <th className="px-2 py-2 text-left font-medium">Criado em</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {MESES[r.mes - 1]} · {safraLabel(r.safra_ano)}
                    </td>
                    <td className="px-2 py-1.5">{r.categoria}</td>
                    <td className="px-2 py-1.5">{r.linha_negocio}</td>
                    <td className="max-w-72 px-2 py-1.5">{r.descricao}</td>
                    <td className="px-2 py-1.5">{r.user_email ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td
                      className={`num px-2 py-1.5 text-right ${Number(r.valor) < 0 ? "text-destructive" : ""}`}
                    >
                      {Number(r.valor) < 0 ? "−" : "+"}
                      {formatBRL(Math.abs(Number(r.valor)))}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setForm({
                            id: r.id,
                            categoria: r.categoria,
                            linha_negocio: r.linha_negocio,
                            safra_ano: r.safra_ano,
                            mes: r.mes,
                            sinal: Number(r.valor) < 0 ? "-" : "+",
                            valor: String(Math.abs(Number(r.valor))).replace(".", ","),
                            descricao: r.descricao,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => excluir.mutate(r.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!registros.length && (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                      Nenhum ajuste lançado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Total dos ajustes exibidos:{" "}
            <span className="num font-medium">{formatBRL(totalFiltro)}</span> · os ajustes são
            somados automaticamente ao valor apurado da base ao gerar o balancete.
          </p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
