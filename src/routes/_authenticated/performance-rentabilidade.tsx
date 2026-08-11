import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, MESES, safraLabel } from "@/lib/balancete";
import {
  agregar,
  agruparPor,
  ATIVIDADE_PENDENTE,
  dentroDoRecorte,
  fetchPerfLancamentos,
  fetchPerfRentabilidade,
  fimMesSafra,
  formatCompacto,
  formatNum,
  formatPct,
  formatPP,
  formatVar,
  inicioMesSafra,
  MESES_SAFRA,
  variacao,
  type Metricas,
  type PerfRow,
} from "@/lib/performance";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Scatter,
  ScatterChart,
  ReferenceLine,
  Cell,
} from "recharts";
import { AlertTriangle, ChevronDown, ChevronRight, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/performance-rentabilidade")({
  head: () => ({
    meta: [
      { title: "Performance e Rentabilidade por Atividade | Balancete Gerencial" },
      {
        name: "description",
        content:
          "Visão executiva de volume, preço, custo e margem por atividade, comparando o ano-safra atual com o anterior.",
      },
      { property: "og:title", content: "Performance e Rentabilidade por Atividade" },
      {
        property: "og:description",
        content:
          "Receita, CPV, margem e rentabilidade por unidade em cada atividade do grupo, com drill-down até o lançamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformanceRentabilidade,
});

const hoje = new Date();
const SAFRA_ATUAL = hoje.getMonth() + 1 >= 4 ? hoje.getFullYear() : hoje.getFullYear() - 1;
const SAFRAS = [SAFRA_ATUAL + 1, SAFRA_ATUAL, SAFRA_ATUAL - 1, SAFRA_ATUAL - 2];

type FiltroKey =
  | "atividade"
  | "divisao"
  | "nomedepto"
  | "nomecusto"
  | "nomecoligada"
  | "codfilial"
  | "codund"
  | "produto";

const FILTROS: { key: FiltroKey; label: string }[] = [
  { key: "atividade", label: "Atividade" },
  { key: "divisao", label: "Divisão" },
  { key: "nomedepto", label: "Departamento" },
  { key: "nomecusto", label: "Rubrica" },
  { key: "nomecoligada", label: "Coligada" },
  { key: "codfilial", label: "Filial" },
  { key: "codund", label: "Unidade" },
  { key: "produto", label: "Produto" },
];

type LinhaAtividade = {
  atividade: string;
  atual: Metricas;
  anterior: Metricas;
  rows: PerfRow[];
};

type OrdemKey =
  | "atividade"
  | "quantidade"
  | "receitaLiquida"
  | "precoMedio"
  | "cpv"
  | "cpvUnitario"
  | "margem"
  | "margemUnitaria"
  | "margemPct";

function PerformanceRentabilidade() {
  const [safra, setSafra] = useState(SAFRA_ATUAL);
  const [mesIni, setMesIni] = useState(4);
  const [mesFim, setMesFim] = useState(3);
  const [filtros, setFiltros] = useState<Record<FiltroKey, string>>({
    atividade: "",
    divisao: "",
    nomedepto: "",
    nomecusto: "",
    nomecoligada: "",
    codfilial: "",
    codund: "",
    produto: "",
  });
  const [ordem, setOrdem] = useState<{ key: OrdemKey; dir: "asc" | "desc" }>({
    key: "receitaLiquida",
    dir: "desc",
  });
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{
    tipo: "RECEITA" | "CPV";
    atividade: string;
    divisao?: string;
    nomedepto?: string;
    nomecusto?: string;
  } | null>(null);

  const periodo = useMemo(
    () => ({
      ini: inicioMesSafra(safra - 1, 4),
      fim: fimMesSafra(safra, 3),
      iniAtual: inicioMesSafra(safra, mesIni),
      fimAtual: fimMesSafra(safra, mesFim),
    }),
    [safra, mesIni, mesFim],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["perf-rentabilidade", periodo.ini, periodo.fim],
    queryFn: () => fetchPerfRentabilidade(periodo.ini, periodo.fim),
  });

  const todas = useMemo(() => data ?? [], [data]);

  const passaFiltro = useMemo(
    () => (r: PerfRow) =>
      FILTROS.every(({ key }) => !filtros[key] || String(r[key]) === filtros[key]),
    [filtros],
  );

  const { atual, anterior } = useMemo(() => {
    const a: PerfRow[] = [];
    const b: PerfRow[] = [];
    for (const r of todas) {
      if (!passaFiltro(r)) continue;
      if (dentroDoRecorte(r.ano, r.mes, safra, mesIni, mesFim)) a.push(r);
      else if (dentroDoRecorte(r.ano, r.mes, safra - 1, mesIni, mesFim)) b.push(r);
    }
    return { atual: a, anterior: b };
  }, [todas, passaFiltro, safra, mesIni, mesFim]);

  const semClassificacao = useMemo(
    () => atual.filter((r) => r.atividade === ATIVIDADE_PENDENTE),
    [atual],
  );

  const visiveisAtual = useMemo(
    () => atual.filter((r) => r.atividade !== ATIVIDADE_PENDENTE),
    [atual],
  );
  const visiveisAnterior = useMemo(
    () => anterior.filter((r) => r.atividade !== ATIVIDADE_PENDENTE),
    [anterior],
  );

  const unidadeRef = useMemo(() => unidadeReferencia(visiveisAtual), [visiveisAtual]);

  const total = useMemo(() => agregar(visiveisAtual, unidadeRef), [visiveisAtual, unidadeRef]);
  const totalAnt = useMemo(() => agregar(visiveisAnterior, unidadeRef), [visiveisAnterior, unidadeRef]);

  const linhas: LinhaAtividade[] = useMemo(() => {
    const chaves = new Set([
      ...visiveisAtual.map((r) => r.atividade),
      ...visiveisAnterior.map((r) => r.atividade),
    ]);
    const porAtual = agruparPor(visiveisAtual, "atividade");
    const porAnt = agruparPor(visiveisAnterior, "atividade");
    return [...chaves].map((atividade) => ({
      atividade,
      rows: porAtual.get(atividade) ?? [],
      atual: agregar(porAtual.get(atividade) ?? []),
      anterior: agregar(porAnt.get(atividade) ?? []),
    }));
  }, [visiveisAtual, visiveisAnterior]);

  const linhasOrdenadas = useMemo(() => {
    const fator = ordem.dir === "asc" ? 1 : -1;
    return [...linhas].sort((x, y) => {
      if (ordem.key === "atividade") return fator * x.atividade.localeCompare(y.atividade, "pt-BR");
      const vx = (x.atual[ordem.key] as number | null) ?? -Infinity;
      const vy = (y.atual[ordem.key] as number | null) ?? -Infinity;
      return fator * (vx - vy);
    });
  }, [linhas, ordem]);

  /** Série mensal do período selecionado (safra atual). */
  const serie = useMemo(() => {
    const ordemMeses = MESES_SAFRA.slice(
      MESES_SAFRA.indexOf(mesIni),
      MESES_SAFRA.indexOf(mesFim) + 1,
    );
    return ordemMeses.map((mes) => {
      const rows = visiveisAtual.filter((r) => r.mes === mes);
      const m = agregar(rows);
      return {
        label: MESES[mes - 1].slice(0, 3),
        quantidade: m.quantidade ?? 0,
        margemUnitaria: m.margemUnitaria ?? 0,
        precoMedio: m.precoMedio ?? 0,
        cpvUnitario: m.cpvUnitario ?? 0,
        margemPct: m.margemPct,
        margem: m.margem,
        receita: m.receitaLiquida,
      };
    });
  }, [visiveisAtual, mesIni, mesFim]);

  const [indicadorBarras, setIndicadorBarras] = useState<
    "margem" | "margemPct" | "margemUnitaria"
  >("margem");

  const opcoes = useMemo(() => {
    const mapa = {} as Record<FiltroKey, Set<string>>;
    for (const { key } of FILTROS) mapa[key] = new Set<string>();
    for (const r of todas) for (const { key } of FILTROS) mapa[key].add(String(r[key]));
    return mapa;
  }, [todas]);

  const semQuantidade = total.quantidade === null || total.quantidade === 0;

  const variacoes = {
    quantidade: variacao(total.quantidade, totalAnt.quantidade),
    receita: variacao(total.receitaLiquida, totalAnt.receitaLiquida),
    precoMedio: variacao(total.precoMedio, totalAnt.precoMedio),
    cpv: variacao(total.cpv, totalAnt.cpv),
    cpvUnitario: variacao(total.cpvUnitario, totalAnt.cpvUnitario),
    margem: variacao(total.margem, totalAnt.margem),
    margemUnitaria: variacao(total.margemUnitaria, totalAnt.margemUnitaria),
    margemPP: total.margemPct - totalAnt.margemPct,
  };

  const alertas = useMemo(() => {
    const lista: string[] = [];
    const q = variacoes.quantidade;
    const mu = variacoes.margemUnitaria;
    if (q !== null && mu !== null) {
      if (q > 0 && mu > 0)
        lista.push("Crescimento de volume acompanhado de melhora da rentabilidade por unidade.");
      if (q > 0 && mu < 0)
        lista.push("Volume vendido cresceu, porém houve redução da margem por unidade.");
    }
    if (variacoes.cpvUnitario !== null && variacoes.precoMedio !== null) {
      if (variacoes.cpvUnitario > variacoes.precoMedio)
        lista.push("CPV por unidade está crescendo acima do preço médio.");
      else if (variacoes.precoMedio > variacoes.cpvUnitario)
        lista.push(
          "Preço médio evoluiu acima do CPV unitário, melhorando o spread operacional.",
        );
    }
    if (q !== null && q < 0) lista.push("Volume vendido apresentou redução no período.");
    return lista;
  }, [variacoes]);

  const resumo = useMemo(() => {
    const partes: string[] = [];
    if (variacoes.quantidade !== null)
      partes.push(`a quantidade vendida variou ${formatVar(variacoes.quantidade)}`);
    partes.push(
      `a Receita Líquida somou ${formatCompacto(total.receitaLiquida)}${
        variacoes.receita !== null ? ` (${formatVar(variacoes.receita)})` : ""
      }`,
    );
    partes.push(
      `o CPV/CMV somou ${formatCompacto(total.cpv)}${
        variacoes.cpv !== null ? ` (${formatVar(variacoes.cpv)})` : ""
      }`,
    );
    const frase1 = `No período selecionado, ${partes.join(", ")}.`;
    const frase2 = `A margem bruta ficou em ${formatCompacto(total.margem)}, equivalente a ${formatPct(
      total.margemPct,
    )} da receita líquida (${formatPct(totalAnt.margemPct)} no período anterior, ${formatPP(
      variacoes.margemPP,
    )}).`;
    const maiorReceita = [...linhas].sort((a, b) => b.atual.receitaLiquida - a.atual.receitaLiquida)[0];
    const maiorMargemPct = [...linhas]
      .filter((l) => l.atual.receitaLiquida > 0)
      .sort((a, b) => b.atual.margemPct - a.atual.margemPct)[0];
    const frase3 =
      maiorReceita && maiorMargemPct
        ? `${maiorReceita.atividade} teve a maior participação na receita (${formatPct(
            total.receitaLiquida !== 0
              ? (maiorReceita.atual.receitaLiquida / total.receitaLiquida) * 100
              : 0,
          )}), enquanto ${maiorMargemPct.atividade} apresentou a maior margem percentual (${formatPct(
            maiorMargemPct.atual.margemPct,
          )}).`
        : "";
    return [frase1, frase2, frase3].filter(Boolean);
  }, [total, totalAnt, variacoes, linhas]);

  const destaques = useMemo(() => {
    if (!linhas.length) return [] as { titulo: string; valor: string; atividade: string }[];
    const top = (
      titulo: string,
      pick: (l: LinhaAtividade) => number | null,
      fmt: (v: number) => string,
    ) => {
      const validos = linhas.filter((l) => pick(l) !== null);
      if (!validos.length) return null;
      const melhor = validos.sort((a, b) => (pick(b) as number) - (pick(a) as number))[0];
      return { titulo, atividade: melhor.atividade, valor: fmt(pick(melhor) as number) };
    };
    return [
      top("Maior Receita", (l) => l.atual.receitaLiquida, formatCompacto),
      top("Maior Quantidade", (l) => l.atual.quantidade, (v) => formatNum(v)),
      top("Maior Margem R$", (l) => l.atual.margem, formatCompacto),
      top("Maior Margem %", (l) => l.atual.margemPct, (v) => formatPct(v)),
      top("Maior Margem / Unidade", (l) => l.atual.margemUnitaria, formatCompacto),
      top(
        "Maior crescimento de Quantidade",
        (l) => variacao(l.atual.quantidade, l.anterior.quantidade),
        (v) => formatVar(v),
      ),
      top(
        "Maior crescimento de Margem",
        (l) => variacao(l.atual.margem, l.anterior.margem),
        (v) => formatVar(v),
      ),
      top(
        "Maior aumento de CPV Unitário",
        (l) => variacao(l.atual.cpvUnitario, l.anterior.cpvUnitario),
        (v) => formatVar(v),
      ),
    ].filter(Boolean) as { titulo: string; valor: string; atividade: string }[];
  }, [linhas]);

  const matriz = useMemo(
    () =>
      linhas
        .map((l) => ({
          atividade: l.atividade,
          x: variacao(l.atual.quantidade, l.anterior.quantidade) ?? 0,
          y: l.atual.margemPct,
          z: Math.max(l.atual.receitaLiquida, 1),
        }))
        .filter((p) => p.z > 1),
    [linhas],
  );
  const margemMedia = total.margemPct;

  function limparFiltros() {
    setFiltros({
      atividade: "",
      divisao: "",
      nomedepto: "",
      nomecusto: "",
      nomecoligada: "",
      codfilial: "",
      codund: "",
      produto: "",
    });
  }

  function alternarOrdem(key: OrdemKey) {
    setOrdem((o) => (o.key === key ? { key, dir: o.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  function alternarExpansao(chave: string) {
    setExpandidas((s) => {
      const novo = new Set(s);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  return (
    <AppLayout
      titulo="Performance e Rentabilidade por Atividade"
      descricao={`Volume, preço, custo e margem por atividade — safra ${safraLabel(safra)} comparada com ${safraLabel(safra - 1)}.`}
    >
      <div className="space-y-6">
        {/* ---------- Filtros ---------- */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <Campo label="Ano / Safra">
              <Select value={String(safra)} onValueChange={(v) => setSafra(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAFRAS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {safraLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Mês inicial">
              <SelectMes valor={mesIni} onChange={setMesIni} />
            </Campo>
            <Campo label="Mês final">
              <SelectMes valor={mesFim} onChange={setMesFim} />
            </Campo>
            {FILTROS.map(({ key, label }) => (
              <Campo key={key} label={label}>
                <Select
                  value={filtros[key] || "__todos"}
                  onValueChange={(v) =>
                    setFiltros((f) => ({ ...f, [key]: v === "__todos" ? "" : v }))
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos">Todos</SelectItem>
                    {[...(opcoes[key] ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR")).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            ))}
            <Button variant="outline" onClick={limparFiltros}>
              <RotateCcw className="size-4" /> Limpar filtros
            </Button>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores…</p>}

        {semQuantidade && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Não há quantidade vendida com unidade única no recorte atual — os indicadores por
              unidade (preço médio, CPV/un e margem/un) ficam indisponíveis. Verifique se a base
              importada possui as colunas QUANTIDADE e CODUND ou refine o filtro de unidade.
            </span>
          </div>
        )}

        {/* ---------- Cards ---------- */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardIndicador
            titulo="Quantidade Vendida"
            valor={
              total.quantidade !== null
                ? `${formatNum(total.quantidade)}${total.unidade ? ` ${total.unidade}` : ""}`
                : "—"
            }
            variacao={variacoes.quantidade}
            detalhe={
              total.quantidade === null && Object.keys(total.quantidadePorUnidade).length
                ? Object.entries(total.quantidadePorUnidade)
                    .map(([u, q]) => `${formatNum(q)} ${u}`)
                    .join(" · ")
                : undefined
            }
          />
          <CardIndicador
            titulo="Receita Líquida"
            valor={formatCompacto(total.receitaLiquida)}
            completo={formatBRL(total.receitaLiquida)}
            variacao={variacoes.receita}
          />
          <CardIndicador
            titulo="CPV / CMV"
            valor={formatCompacto(total.cpv)}
            completo={formatBRL(total.cpv)}
            variacao={variacoes.cpv}
            inverso
          />
          <CardIndicador
            titulo="Margem Bruta"
            valor={formatCompacto(total.margem)}
            completo={formatBRL(total.margem)}
            variacao={variacoes.margem}
          />
          <CardIndicador titulo="Margem Bruta %" valor={formatPct(total.margemPct)} pp={variacoes.margemPP} />
          <CardIndicador
            titulo="Preço Médio / Unidade"
            valor={total.precoMedio !== null ? formatBRL(total.precoMedio) : "—"}
            variacao={variacoes.precoMedio}
          />
          <CardIndicador
            titulo="CPV / Unidade"
            valor={total.cpvUnitario !== null ? formatBRL(total.cpvUnitario) : "—"}
            variacao={variacoes.cpvUnitario}
            inverso
          />
          <CardIndicador
            titulo="Margem / Unidade"
            valor={total.margemUnitaria !== null ? formatBRL(total.margemUnitaria) : "—"}
            variacao={variacoes.margemUnitaria}
          />
        </div>

        {/* ---------- Faixa executiva ---------- */}
        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-3 pt-6 text-sm">
            <Faixa rotulo="QUANTIDADE" valor={formatVar(variacoes.quantidade)} v={variacoes.quantidade} />
            <Faixa rotulo="RECEITA" valor={formatVar(variacoes.receita)} v={variacoes.receita} />
            <Faixa rotulo="PREÇO MÉDIO" valor={formatVar(variacoes.precoMedio)} v={variacoes.precoMedio} />
            <Faixa rotulo="CPV" valor={formatVar(variacoes.cpv)} v={variacoes.cpv} inverso />
            <Faixa
              rotulo="CPV / UNIDADE"
              valor={formatVar(variacoes.cpvUnitario)}
              v={variacoes.cpvUnitario}
              inverso
            />
            <Faixa
              rotulo="MARGEM / UNIDADE"
              valor={formatVar(variacoes.margemUnitaria)}
              v={variacoes.margemUnitaria}
            />
            <Faixa rotulo="MARGEM %" valor={formatPP(variacoes.margemPP)} v={variacoes.margemPP} />
            {total.hedge !== 0 && (
              <Faixa rotulo="HEDGE (+/-)" valor={formatCompacto(total.hedge)} v={total.hedge} />
            )}
          </CardContent>
        </Card>

        {/* ---------- Resumo executivo ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo Executivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            {resumo.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {alertas.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-muted-foreground">
                {alertas.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ---------- Tabela principal ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rentabilidade por Atividade</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <Th onClick={() => alternarOrdem("atividade")}>ATIVIDADE</Th>
                  <Th right onClick={() => alternarOrdem("quantidade")}>QTD</Th>
                  <Th right onClick={() => alternarOrdem("receitaLiquida")}>RECEITA LÍQUIDA</Th>
                  <Th right onClick={() => alternarOrdem("precoMedio")}>PREÇO MÉDIO</Th>
                  <Th right onClick={() => alternarOrdem("cpv")}>CPV</Th>
                  <Th right onClick={() => alternarOrdem("cpvUnitario")}>CPV/UN</Th>
                  <Th right onClick={() => alternarOrdem("margem")}>MARGEM</Th>
                  <Th right onClick={() => alternarOrdem("margemUnitaria")}>MARGEM/UN</Th>
                  <Th right onClick={() => alternarOrdem("margemPct")}>MARGEM %</Th>
                  <Th right>% RECEITA</Th>
                  <Th right>% MARGEM</Th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((l) => {
                  const chave = l.atividade;
                  const aberto = expandidas.has(chave);
                  return (
                    <Fragment key={chave}>
                      <tr className="border-b border-border/60 hover:bg-muted/40">
                        <td className="py-2">
                          <button
                            className="flex items-center gap-1 font-medium"
                            onClick={() => alternarExpansao(chave)}
                          >
                            {aberto ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                            {l.atividade}
                          </button>
                        </td>
                        <Td
                          onClick={() => setDetalhe({ tipo: "RECEITA", atividade: l.atividade })}
                        >
                          {l.atual.quantidade !== null ? formatNum(l.atual.quantidade) : "—"}
                        </Td>
                        <Td
                          titulo={formatBRL(l.atual.receitaLiquida)}
                          onClick={() => setDetalhe({ tipo: "RECEITA", atividade: l.atividade })}
                        >
                          {formatCompacto(l.atual.receitaLiquida)}
                        </Td>
                        <Td>{l.atual.precoMedio !== null ? formatBRL(l.atual.precoMedio) : "—"}</Td>
                        <Td
                          titulo={formatBRL(l.atual.cpv)}
                          onClick={() => setDetalhe({ tipo: "CPV", atividade: l.atividade })}
                        >
                          {formatCompacto(l.atual.cpv)}
                        </Td>
                        <Td>{l.atual.cpvUnitario !== null ? formatBRL(l.atual.cpvUnitario) : "—"}</Td>
                        <Td titulo={formatBRL(l.atual.margem)}>{formatCompacto(l.atual.margem)}</Td>
                        <Td>
                          {l.atual.margemUnitaria !== null ? formatBRL(l.atual.margemUnitaria) : "—"}
                        </Td>
                        <Td>{formatPct(l.atual.margemPct)}</Td>
                        <Td>
                          {formatPct(
                            total.receitaLiquida !== 0
                              ? (l.atual.receitaLiquida / total.receitaLiquida) * 100
                              : 0,
                          )}
                        </Td>
                        <Td>
                          {formatPct(
                            total.margem !== 0 ? (l.atual.margem / total.margem) * 100 : 0,
                          )}
                        </Td>
                      </tr>
                      {aberto && (
                        <DrillDown
                          rows={l.rows}
                          atividade={l.atividade}
                          expandidas={expandidas}
                          alternar={alternarExpansao}
                          abrirDetalhe={setDetalhe}
                        />
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2">TOTAL</td>
                  <Td>{total.quantidade !== null ? formatNum(total.quantidade) : "—"}</Td>
                  <Td titulo={formatBRL(total.receitaLiquida)}>{formatCompacto(total.receitaLiquida)}</Td>
                  <Td>{total.precoMedio !== null ? formatBRL(total.precoMedio) : "—"}</Td>
                  <Td titulo={formatBRL(total.cpv)}>{formatCompacto(total.cpv)}</Td>
                  <Td>{total.cpvUnitario !== null ? formatBRL(total.cpvUnitario) : "—"}</Td>
                  <Td titulo={formatBRL(total.margem)}>{formatCompacto(total.margem)}</Td>
                  <Td>{total.margemUnitaria !== null ? formatBRL(total.margemUnitaria) : "—"}</Td>
                  <Td>{formatPct(total.margemPct)}</Td>
                  <Td>100,00%</Td>
                  <Td>100,00%</Td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              CPV / Receita: {formatPct(total.cpvSobreReceita)} · Margem de Contribuição
              indisponível enquanto não houver classificação de despesas variáveis.
            </p>
          </CardContent>
        </Card>

        {/* ---------- Gráficos ---------- */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Grafico titulo="Volume Vendido x Margem por Unidade">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis yAxisId="q" fontSize={12} tickFormatter={(v) => formatNum(Number(v), 0)} />
              <YAxis yAxisId="m" orientation="right" fontSize={12} />
              <Tooltip formatter={(v: number) => formatNum(Number(v))} />
              <Legend />
              <Bar yAxisId="q" dataKey="quantidade" name="Quantidade" fill="hsl(var(--chart-1))" />
              <Line
                yAxisId="m"
                type="monotone"
                dataKey="margemUnitaria"
                name="Margem / Unidade"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
              />
            </ComposedChart>
          </Grafico>

          <Grafico titulo="Preço Médio x CPV Unitário">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="precoMedio" name="Preço Médio / Un" stroke="hsl(var(--chart-1))" strokeWidth={2} />
              <Line type="monotone" dataKey="cpvUnitario" name="CPV / Un" stroke="hsl(var(--chart-4))" strokeWidth={2} />
            </LineChart>
          </Grafico>

          <Grafico titulo="Volume x Margem %">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis yAxisId="q" fontSize={12} tickFormatter={(v) => formatNum(Number(v), 0)} />
              <YAxis yAxisId="p" orientation="right" fontSize={12} unit="%" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="q" dataKey="quantidade" name="Quantidade" fill="hsl(var(--chart-3))" />
              <Line yAxisId="p" type="monotone" dataKey="margemPct" name="Margem %" stroke="hsl(var(--chart-2))" strokeWidth={2} />
            </ComposedChart>
          </Grafico>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Margem por Atividade</CardTitle>
              <Select value={indicadorBarras} onValueChange={(v) => setIndicadorBarras(v as typeof indicadorBarras)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="margem">Margem R$</SelectItem>
                  <SelectItem value="margemPct">Margem %</SelectItem>
                  <SelectItem value="margemUnitaria">Margem por Unidade</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={linhas.map((l) => ({
                    atividade: l.atividade,
                    valor: (l.atual[indicadorBarras] as number | null) ?? 0,
                  }))}
                  margin={{ left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" fontSize={12} tickFormatter={(v) => formatNum(Number(v), 0)} />
                  <YAxis type="category" dataKey="atividade" width={130} fontSize={11} />
                  <Tooltip
                    formatter={(v: number) =>
                      indicadorBarras === "margemPct" ? formatPct(Number(v)) : formatBRL(Number(v))
                    }
                  />
                  <Bar dataKey="valor" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Grafico titulo="Participação no Resultado (margem)">
            <BarChart
              data={linhas.map((l) => ({
                atividade: l.atividade,
                pct: total.margem !== 0 ? (l.atual.margem / total.margem) * 100 : 0,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="atividade" fontSize={10} interval={0} angle={-15} height={50} textAnchor="end" />
              <YAxis fontSize={12} unit="%" />
              <Tooltip formatter={(v: number) => formatPct(Number(v))} />
              <Bar dataKey="pct" name="% da margem total" fill="hsl(var(--chart-1))">
                {linhas.map((l) => (
                  <Cell key={l.atividade} />
                ))}
              </Bar>
            </BarChart>
          </Grafico>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Matriz Volume x Rentabilidade</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Variação da quantidade"
                    unit="%"
                    fontSize={12}
                  />
                  <YAxis type="number" dataKey="y" name="Margem %" unit="%" fontSize={12} />
                  <ZAxis type="number" dataKey="z" range={[80, 700]} name="Receita Líquida" />
                  <ReferenceLine x={0} className="stroke-border" />
                  <ReferenceLine y={margemMedia} strokeDasharray="4 4" className="stroke-border" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    formatter={(v: number, n: string) =>
                      n === "Receita Líquida" ? formatCompacto(Number(v)) : formatPct(Number(v))
                    }
                  />
                  <Scatter data={matriz} fill="hsl(var(--chart-2))" />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-muted-foreground">
                Quadrantes (apoio visual): direita/acima = expandir · esquerda/acima = defender ·
                direita/abaixo = revisar · esquerda/abaixo = crítico. Linha tracejada = margem média
                do recorte ({formatPct(margemMedia)}).
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ---------- Destaques ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destaques por Atividade</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {destaques.map((d) => (
              <div key={d.titulo} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{d.titulo}</p>
                <p className="mt-1 text-sm font-medium">{d.atividade}</p>
                <p className="text-sm text-muted-foreground">{d.valor}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ---------- Tabela comparativa ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Comparativo {safraLabel(safra)} x {safraLabel(safra - 1)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Comparativo titulo="CONSOLIDADO" atual={total} anterior={totalAnt} />
            {linhasOrdenadas.map((l) => (
              <Comparativo
                key={l.atividade}
                titulo={l.atividade}
                atual={l.atual}
                anterior={l.anterior}
              />
            ))}
          </CardContent>
        </Card>

        {/* ---------- Validação de qualidade ---------- */}
        {semClassificacao.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-destructive" /> Classificação pendente
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <p className="mb-3 text-muted-foreground">
                Lançamentos de receita/CPV sem atividade definida. Eles não são distribuídos para
                nenhuma atividade e não entram nos indicadores executivos.
              </p>
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-1 text-left">TIPO</th>
                    <th className="py-1 text-left">DEPARTAMENTO</th>
                    <th className="py-1 text-left">RUBRICA</th>
                    <th className="py-1 text-left">PRODUTO</th>
                    <th className="py-1 text-right">VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {semClassificacao.map((r, i) => (
                    <tr key={`${r.tipo}-${r.produto}-${i}`} className="border-b border-border/60">
                      <td className="py-1">{r.tipo}</td>
                      <td className="py-1">{r.nomedepto}</td>
                      <td className="py-1">{r.nomecusto}</td>
                      <td className="py-1">{r.produto}</td>
                      <td className="py-1 text-right tabular-nums">{formatBRL(Number(r.valor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <DetalheDialog
        detalhe={detalhe}
        onClose={() => setDetalhe(null)}
        ini={periodo.iniAtual}
        fim={periodo.fimAtual}
      />
    </AppLayout>
  );
}

/* ============================ Componentes ============================ */

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function SelectMes({ valor, onChange }: { valor: number; onChange: (m: number) => void }) {
  return (
    <Select value={String(valor)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MESES_SAFRA.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {MESES[m - 1]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CardIndicador({
  titulo,
  valor,
  completo,
  variacao: v,
  pp,
  inverso,
  detalhe,
}: {
  titulo: string;
  valor: string;
  completo?: string;
  variacao?: number | null;
  pp?: number | null;
  inverso?: boolean;
  detalhe?: string;
}) {
  const numero = pp ?? v ?? null;
  const bom = numero === null ? null : inverso ? numero < 0 : numero > 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums" title={completo}>
          {valor}
        </p>
        {numero !== null && (
          <p
            className={`mt-1 flex items-center gap-1 text-xs ${bom ? "text-emerald-600" : "text-destructive"}`}
          >
            {bom ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {pp !== undefined && pp !== null ? formatPP(pp) : formatVar(v ?? null)} vs. período
            anterior
          </p>
        )}
        {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

function Faixa({
  rotulo,
  valor,
  v,
  inverso,
}: {
  rotulo: string;
  valor: string;
  v: number | null;
  inverso?: boolean;
}) {
  const bom = v === null ? null : inverso ? v < 0 : v > 0;
  return (
    <div>
      <p className="text-[11px] tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          bom === null ? "" : bom ? "text-emerald-600" : "text-destructive"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function Th({
  children,
  right,
  onClick,
}: {
  children: React.ReactNode;
  right?: boolean;
  onClick?: () => void;
}) {
  return (
    <th
      className={`py-2 font-medium ${right ? "text-right" : "text-left"} ${onClick ? "cursor-pointer select-none hover:text-foreground" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  titulo,
  onClick,
}: {
  children: React.ReactNode;
  titulo?: string;
  onClick?: () => void;
}) {
  return (
    <td
      title={titulo}
      onClick={onClick}
      className={`py-2 text-right tabular-nums ${onClick ? "cursor-pointer hover:underline" : ""}`}
    >
      {children}
    </td>
  );
}

type AbrirDetalhe = (d: {
  tipo: "RECEITA" | "CPV";
  atividade: string;
  divisao?: string;
  nomedepto?: string;
  nomecusto?: string;
}) => void;

/** Níveis ATIVIDADE → DIVISÃO → DEPARTAMENTO → RUBRICA. */
function DrillDown({
  rows,
  atividade,
  expandidas,
  alternar,
  abrirDetalhe,
}: {
  rows: PerfRow[];
  atividade: string;
  expandidas: Set<string>;
  alternar: (chave: string) => void;
  abrirDetalhe: AbrirDetalhe;
}) {
  const divisoes = [...agruparPor(rows, "divisao").entries()];
  return (
    <>
      {divisoes.map(([divisao, linhasDiv]) => {
        const chaveDiv = `${atividade}|${divisao}`;
        const abertoDiv = expandidas.has(chaveDiv);
        const deptos = [...agruparPor(linhasDiv, "nomedepto").entries()];
        return (
          <Fragment key={chaveDiv}>
            <LinhaNivel
              nivel={1}
              rotulo={divisao}
              metricas={agregar(linhasDiv)}
              aberto={abertoDiv}
              onToggle={() => alternar(chaveDiv)}
              onReceita={() => abrirDetalhe({ tipo: "RECEITA", atividade, divisao })}
              onCpv={() => abrirDetalhe({ tipo: "CPV", atividade, divisao })}
            />
            {abertoDiv &&
              deptos.map(([depto, linhasDep]) => {
                const chaveDep = `${chaveDiv}|${depto}`;
                const abertoDep = expandidas.has(chaveDep);
                const custos = [...agruparPor(linhasDep, "nomecusto").entries()];
                return (
                  <Fragment key={chaveDep}>
                    <LinhaNivel
                      nivel={2}
                      rotulo={depto}
                      metricas={agregar(linhasDep)}
                      aberto={abertoDep}
                      onToggle={() => alternar(chaveDep)}
                      onReceita={() =>
                        abrirDetalhe({ tipo: "RECEITA", atividade, divisao, nomedepto: depto })
                      }
                      onCpv={() =>
                        abrirDetalhe({ tipo: "CPV", atividade, divisao, nomedepto: depto })
                      }
                    />
                    {abertoDep &&
                      custos.map(([custo, linhasCusto]) => (
                        <LinhaNivel
                          key={`${chaveDep}|${custo}`}
                          nivel={3}
                          rotulo={custo}
                          metricas={agregar(linhasCusto)}
                          onReceita={() =>
                            abrirDetalhe({
                              tipo: "RECEITA",
                              atividade,
                              divisao,
                              nomedepto: depto,
                              nomecusto: custo,
                            })
                          }
                          onCpv={() =>
                            abrirDetalhe({
                              tipo: "CPV",
                              atividade,
                              divisao,
                              nomedepto: depto,
                              nomecusto: custo,
                            })
                          }
                        />
                      ))}
                  </Fragment>
                );
              })}
          </Fragment>
        );
      })}
    </>
  );
}

function LinhaNivel({
  nivel,
  rotulo,
  metricas,
  aberto,
  onToggle,
  onReceita,
  onCpv,
}: {
  nivel: number;
  rotulo: string;
  metricas: Metricas;
  aberto?: boolean;
  onToggle?: () => void;
  onReceita?: () => void;
  onCpv?: () => void;
}) {
  return (
    <tr className="border-b border-border/40 bg-muted/20 text-xs">
      <td className="py-1.5" style={{ paddingLeft: nivel * 20 }}>
        {onToggle ? (
          <button className="flex items-center gap-1" onClick={onToggle}>
            {aberto ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {rotulo}
          </button>
        ) : (
          <span className="text-muted-foreground">{rotulo}</span>
        )}
      </td>
      <Td onClick={onReceita}>{metricas.quantidade !== null ? formatNum(metricas.quantidade) : "—"}</Td>
      <Td titulo={formatBRL(metricas.receitaLiquida)} onClick={onReceita}>
        {formatCompacto(metricas.receitaLiquida)}
      </Td>
      <Td>{metricas.precoMedio !== null ? formatBRL(metricas.precoMedio) : "—"}</Td>
      <Td titulo={formatBRL(metricas.cpv)} onClick={onCpv}>
        {formatCompacto(metricas.cpv)}
      </Td>
      <Td>{metricas.cpvUnitario !== null ? formatBRL(metricas.cpvUnitario) : "—"}</Td>
      <Td titulo={formatBRL(metricas.margem)}>{formatCompacto(metricas.margem)}</Td>
      <Td>{metricas.margemUnitaria !== null ? formatBRL(metricas.margemUnitaria) : "—"}</Td>
      <Td>{formatPct(metricas.margemPct)}</Td>
      <Td>—</Td>
      <Td>—</Td>
    </tr>
  );
}

function Comparativo({
  titulo,
  atual,
  anterior,
}: {
  titulo: string;
  atual: Metricas;
  anterior: Metricas;
}) {
  const linhas: { rotulo: string; a: string; b: string; v: string }[] = [
    {
      rotulo: "Quantidade",
      a: atual.quantidade !== null ? formatNum(atual.quantidade) : "—",
      b: anterior.quantidade !== null ? formatNum(anterior.quantidade) : "—",
      v: formatVar(variacao(atual.quantidade, anterior.quantidade)),
    },
    {
      rotulo: "Receita Líquida",
      a: formatCompacto(atual.receitaLiquida),
      b: formatCompacto(anterior.receitaLiquida),
      v: formatVar(variacao(atual.receitaLiquida, anterior.receitaLiquida)),
    },
    {
      rotulo: "Preço Médio",
      a: atual.precoMedio !== null ? formatBRL(atual.precoMedio) : "—",
      b: anterior.precoMedio !== null ? formatBRL(anterior.precoMedio) : "—",
      v: formatVar(variacao(atual.precoMedio, anterior.precoMedio)),
    },
    {
      rotulo: "CPV",
      a: formatCompacto(atual.cpv),
      b: formatCompacto(anterior.cpv),
      v: formatVar(variacao(atual.cpv, anterior.cpv)),
    },
    {
      rotulo: "CPV / Unidade",
      a: atual.cpvUnitario !== null ? formatBRL(atual.cpvUnitario) : "—",
      b: anterior.cpvUnitario !== null ? formatBRL(anterior.cpvUnitario) : "—",
      v: formatVar(variacao(atual.cpvUnitario, anterior.cpvUnitario)),
    },
    {
      rotulo: "Margem",
      a: formatCompacto(atual.margem),
      b: formatCompacto(anterior.margem),
      v: formatVar(variacao(atual.margem, anterior.margem)),
    },
    {
      rotulo: "Margem / Unidade",
      a: atual.margemUnitaria !== null ? formatBRL(atual.margemUnitaria) : "—",
      b: anterior.margemUnitaria !== null ? formatBRL(anterior.margemUnitaria) : "—",
      v: formatVar(variacao(atual.margemUnitaria, anterior.margemUnitaria)),
    },
    {
      rotulo: "Margem %",
      a: formatPct(atual.margemPct),
      b: formatPct(anterior.margemPct),
      v: formatPP(atual.margemPct - anterior.margemPct),
    },
  ];

  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{titulo}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-1 text-left"></th>
            <th className="py-1 text-right">ATUAL</th>
            <th className="py-1 text-right">ANTERIOR</th>
            <th className="py-1 text-right">VARIAÇÃO</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className="border-b border-border/50">
              <td className="py-1">{l.rotulo}</td>
              <td className="py-1 text-right tabular-nums">{l.a}</td>
              <td className="py-1 text-right tabular-nums">{l.b}</td>
              <td className="py-1 text-right tabular-nums">{l.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Grafico({ titulo, children }: { titulo: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function DetalheDialog({
  detalhe,
  onClose,
  ini,
  fim,
}: {
  detalhe: {
    tipo: "RECEITA" | "CPV";
    atividade: string;
    divisao?: string;
    nomedepto?: string;
    nomecusto?: string;
  } | null;
  onClose: () => void;
  ini: string;
  fim: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["perf-lancamentos", ini, fim, detalhe],
    enabled: !!detalhe,
    queryFn: () =>
      fetchPerfLancamentos({
        ini,
        fim,
        tipo: detalhe!.tipo,
        atividade: detalhe!.atividade,
        divisao: detalhe!.divisao,
        nomedepto: detalhe!.nomedepto,
        nomecusto: detalhe!.nomecusto,
      }),
  });

  const receita = detalhe?.tipo === "RECEITA";

  return (
    <Dialog open={!!detalhe} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {receita ? "Lançamentos de Receita" : "Lançamentos de CPV"} — {detalhe?.atividade}
            {detalhe?.divisao ? ` / ${detalhe.divisao}` : ""}
            {detalhe?.nomedepto ? ` / ${detalhe.nomedepto}` : ""}
            {detalhe?.nomecusto ? ` / ${detalhe.nomecusto}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1 text-left">DATA</th>
                <th className="py-1 text-left">COLIGADA</th>
                <th className="py-1 text-left">FILIAL</th>
                {receita && <th className="py-1 text-left">DOCUMENTO</th>}
                <th className="py-1 text-left">DIVISÃO</th>
                <th className="py-1 text-left">DEPTO</th>
                <th className="py-1 text-left">RUBRICA</th>
                <th className="py-1 text-left">CONTA CONTÁBIL</th>
                {receita && <th className="py-1 text-left">PRODUTO</th>}
                {receita && <th className="py-1 text-left">UN</th>}
                {receita && <th className="py-1 text-right">QTD</th>}
                {receita && <th className="py-1 text-right">UNITÁRIO</th>}
                <th className="py-1 text-right">SALDO</th>
                {receita && <th className="py-1 text-left">HISTÓRICO</th>}
                <th className="py-1 text-left">IDPARTIDA</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-1">{new Date(`${l.data}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                  <td className="py-1">{l.nomecoligada}</td>
                  <td className="py-1">{l.codfilial}</td>
                  {receita && <td className="py-1">{l.documento ?? "-"}</td>}
                  <td className="py-1">{l.divisao}</td>
                  <td className="py-1">{l.nomedepto}</td>
                  <td className="py-1">{l.nomecusto}</td>
                  <td className="py-1">{l.contacontabil ?? l.vcodconta}</td>
                  {receita && <td className="py-1">{l.produto}</td>}
                  {receita && <td className="py-1">{l.codund}</td>}
                  {receita && (
                    <td className="py-1 text-right tabular-nums">
                      {l.quantidade !== null ? formatNum(Number(l.quantidade)) : "—"}
                    </td>
                  )}
                  {receita && (
                    <td className="py-1 text-right tabular-nums">
                      {l.saldounitario !== null ? formatBRL(Number(l.saldounitario)) : "—"}
                    </td>
                  )}
                  <td className="py-1 text-right tabular-nums">{formatBRL(Number(l.vlcusto))}</td>
                  {receita && <td className="py-1">{l.histfaturamento ?? "-"}</td>}
                  <td className="py-1">{l.idpartida ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.length === 500 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Exibindo os 500 primeiros lançamentos do recorte.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
