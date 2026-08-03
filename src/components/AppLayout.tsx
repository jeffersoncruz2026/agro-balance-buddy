import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useIsAdmin";
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
  ShieldCheck,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };

/** Relatórios — visíveis para todo mundo. */
const NAV_RELATORIOS = [
  { to: "/balancete", label: "Balancete", icon: FileSpreadsheet },
  { to: "/balancete-gerencial", label: "Balancete Gerencial", icon: FileStack },
  { to: "/resultado-financeiro", label: "Resultado Financeiro", icon: Landmark },
  { to: "/desp-adm", label: "Despesas Administrativas", icon: Building2 },
  { to: "/analise-despesas-adm", label: "Análise Despesas ADM", icon: Newspaper },
  { to: "/bp-dre", label: "Balanço Patrimonial e DRE", icon: FileBarChart2 },
] as const;

/**
 * Administrador — base, mapeamentos e configurações. Futuramente deve ficar
 * visível só para o usuário admin/DEV (jeffersoncardosomb@gmail.com).
 */
const NAV_ADMIN = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/importar", label: "Importar base", icon: Upload },
  { to: "/depara", label: "De/Para", icon: ArrowLeftRight },
  { to: "/pendencias", label: "Pendências", icon: AlertTriangle },
  { to: "/bp-dre-importar", label: "Importar Balancete Contábil", icon: FileUp },
  { to: "/bp-dre-depara", label: "De/Para BP/DRE", icon: Scale },
  { to: "/ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

/** Visível apenas para usuários com papel 'admin'. */
const NAV_USUARIOS = [
  { to: "/controle-usuarios", label: "Controle de Usuários", icon: ShieldCheck },
] as const;

export function AppLayout({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin } = useIsAdmin();

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex print:hidden">
        <div className="mb-8 flex items-center gap-2 px-2">
          <Sprout className="size-5 text-sidebar-primary" />
          <span className="font-display text-sm leading-tight font-semibold">
            Balancete
            <br />
            Gerencial
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks itens={NAV_RELATORIOS} path={path} />

          <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wide text-sidebar-foreground/40 uppercase">
            Administrador
          </p>
          <NavLinks itens={NAV_ADMIN} path={path} />

          {isAdmin && (
            <>
              <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wide text-sidebar-foreground/40 uppercase">
                Usuários
              </p>
              <NavLinks itens={NAV_USUARIOS} path={path} />
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-card px-6 py-5">
          <div>
            <h1 className="font-display text-xl font-semibold">{titulo}</h1>
            {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">{acoes}</div>
        </header>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden print:hidden">
          {NAV_RELATORIOS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground"
              activeProps={{ className: "bg-secondary text-foreground font-medium" }}
            >
              {label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          {NAV_ADMIN.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground"
              activeProps={{ className: "bg-secondary text-foreground font-medium" }}
            >
              {label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-border" />
              {NAV_USUARIOS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground"
                  activeProps={{ className: "bg-secondary text-foreground font-medium" }}
                >
                  {label}
                </Link>
              ))}
            </>
          )}
        </div>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLinks({ itens, path }: { itens: readonly NavItem[]; path: string }) {
  return (
    <>
      {itens.map(({ to, label, icon: Icon }) => {
        const ativo = path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
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
