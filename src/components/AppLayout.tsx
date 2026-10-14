import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentType, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sprout,
  LayoutDashboard,
  Upload,
  ArrowLeftRight,
  AlertTriangle,
  FileSpreadsheet,
  FileStack,
  Building2,
  SlidersHorizontal,
  Settings,
  LogOut,
  Landmark,
  Scale,
  FileUp,
  FileBarChart2,
  Newspaper,
  Gauge,
  ShieldCheck,
  CalendarRange,
  Menu,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };

/** Relatórios — visíveis para todo mundo. */
const NAV_RELATORIOS = [
  { to: "/balancete-gerencial", label: "Balancete Gerencial", icon: FileStack },
  { to: "/comparativo", label: "Comparativo", icon: CalendarRange },
  { to: "/resultado-financeiro", label: "Resultado Financeiro", icon: Landmark },
  { to: "/analise-despesas-adm", label: "Análise Despesas ADM", icon: Newspaper },
  { to: "/performance-rentabilidade", label: "Performance e Rentabilidade", icon: Gauge },
  { to: "/bp-dre", label: "Balanço Patrimonial e DRE", icon: FileBarChart2 },
] as const;

/** Administrador — visível e acessível apenas para usuários com papel 'admin'. */
const NAV_ADMIN = [
  { to: "/balancete", label: "Balancete", icon: FileSpreadsheet },
  { to: "/desp-adm", label: "Despesas Administrativas", icon: Building2 },
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/importar", label: "Importar base", icon: Upload },
  { to: "/depara", label: "De/Para", icon: ArrowLeftRight },
  { to: "/pendencias", label: "Pendências", icon: AlertTriangle },
  { to: "/bp-dre-importar", label: "Importar Balancete Contábil", icon: FileUp },
  { to: "/bp-dre-depara", label: "De/Para BP/DRE", icon: Scale },
  { to: "/ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
  { to: "/controle-usuarios", label: "Controle de Usuários", icon: ShieldCheck },
] as const;

export function AppLayout({
  titulo,
  descricao,
  acoes,
  children,
  ocultarCabecalhoImpressao = false,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  /** Oculta o cabeçalho da página na impressão (relatórios que têm cabeçalho próprio). */
  ocultarCabecalhoImpressao?: boolean;
}) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin } = useIsAdmin();

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const [menuAberto, setMenuAberto] = useState(false);

  const conteudoMenu = (
    <>
      <div className="mb-8 flex items-center gap-2 px-2">
        <Sprout className="size-5 text-sidebar-primary" />
        <span className="font-display text-sm leading-tight font-semibold">
          Balancete
          <br />
          Gerencial
        </span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <NavLinks itens={NAV_RELATORIOS} path={path} onNavigate={() => setMenuAberto(false)} />

        {isAdmin && (
          <>
            <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wide text-sidebar-foreground/40 uppercase">
              Administrador
            </p>
            <NavLinks itens={NAV_ADMIN} path={path} onNavigate={() => setMenuAberto(false)} />
          </>
        )}
      </nav>
      <Button
        variant="ghost"
        onClick={sair}
        className="justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" /> Sair
      </Button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex print:hidden">
        {conteudoMenu}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular: barra superior com menu lateral (substitui a sidebar fixa). */}
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden print:hidden">
          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Abrir menu"
                className="text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-72 flex-col border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {conteudoMenu}
            </SheetContent>
          </Sheet>
          <Sprout className="size-4 shrink-0 text-sidebar-primary" />
          <span className="truncate font-display text-sm font-semibold">{titulo}</span>
        </div>

        <header
          className={`flex flex-wrap items-end justify-between gap-3 border-b border-border bg-card px-4 py-3 md:gap-4 md:px-6 md:py-5 ${ocultarCabecalhoImpressao ? "print:hidden" : ""}`}
        >
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold md:text-xl">{titulo}</h1>
            {descricao && (
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">{descricao}</p>
            )}
          </div>
          {acoes && (
            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto print:hidden">
              {acoes}
            </div>
          )}
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLinks({
  itens,
  path,
  onNavigate,
}: {
  itens: readonly NavItem[];
  path: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {itens.map(({ to, label, icon: Icon }) => {
        const ativo = path === to || path.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              ativo
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </>
  );
}
