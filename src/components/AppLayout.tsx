import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

const NAV = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/importar", label: "Importar base", icon: Upload },
  { to: "/depara", label: "De/Para", icon: ArrowLeftRight },
  { to: "/pendencias", label: "Pendências", icon: AlertTriangle },
  { to: "/balancete", label: "Balancete", icon: FileSpreadsheet },
  { to: "/balancete-gerencial", label: "Balancete Gerencial", icon: FileStack },
  { to: "/resultado-financeiro", label: "Resultado Financeiro", icon: Landmark },
  { to: "/desp-adm", label: "Despesas Administrativas", icon: Building2 },
  { to: "/ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
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
          {NAV.map(({ to, label, icon: Icon }) => {
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
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden print:hidden">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground"
              activeProps={{ className: "bg-secondary text-foreground font-medium" }}
            >
              {label}
            </Link>
          ))}
        </div>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
