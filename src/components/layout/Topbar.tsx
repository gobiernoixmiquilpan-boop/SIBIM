"use client";

import { Bell, MagnifyingGlass, ArrowClockwise, List, WarningOctagon, XCircle, Clock } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { useUI } from "@/components/layout/ui-context";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { isAreaAccessible } from "@/lib/access";
import { useData } from "@/lib/store";
import { useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";

function vencimientoColor(dias: number) {
  if (dias < 0)  return { color: "#F43F5E", bg: "rgba(244,63,94,0.15)", label: "Vencido" };
  if (dias === 0) return { color: "#F97316", bg: "rgba(249,115,22,0.15)", label: "Vence hoy" };
  if (dias <= 2)  return { color: "#F59E0B", bg: "rgba(245,158,11,0.15)", label: "Por vencer" };
  return          { color: "#A78BFA", bg: "rgba(167,139,250,0.15)", label: "Por vencer" };
}

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { setSidebarOpen, setCommandOpen } = useUI();
  const router = useRouter();
  const user = useAuth();
  const { products } = useData();
  const [now] = useState(() => Date.now());
  const [spinning, setSpinning] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const notifRef = useDismissableMenu<HTMLDivElement>(notifOpen, closeNotif);

  const scopedProducts = user.role === "admin" ? products : products.filter((p) => isAreaAccessible(user, p.area));
  const alertCount = scopedProducts.filter((p) => {
    if (p.estado === "bajo_stock" || p.estado === "agotado") return true;
    if (p.fecha_vencimiento) {
      const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - now) / 86400000);
      return dias <= 7 && dias >= 0;
    }
    return false;
  }).length;

  // Build up to 5 most urgent alerts: agotados first, then bajo_stock, then porVencer
  const urgentAlerts = [
    ...scopedProducts
      .filter((p) => p.estado === "agotado")
      .map((p) => ({ product: p, tipo: "agotado" as const })),
    ...scopedProducts
      .filter((p) => p.estado === "bajo_stock")
      .map((p) => ({ product: p, tipo: "bajo_stock" as const })),
    ...scopedProducts
      .filter((p) => {
        if (!p.fecha_vencimiento) return false;
        const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - now) / 86400000);
        return dias <= 7;
      })
      .map((p) => ({ product: p, tipo: "por_vencer" as const })),
  ].slice(0, 8);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 700);
  }, [router]);

  const fecha = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-border sticky top-0 z-40 bg-background/85 backdrop-blur-sm">

      {/* Hamburger (mobile) + Logo + Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
          aria-label="Abrir menú"
        >
          <List className="w-5 h-5" />
        </Button>

        <Logo size={30} className="flex-shrink-0 hidden sm:block" />
        <div className="hidden sm:block w-px h-7 bg-border flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight truncate">{title}</h1>
          <p className="text-xs capitalize text-muted-foreground truncate">{subtitle || fecha}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg text-sm text-muted-foreground border border-border bg-muted hover:bg-accent hover:text-foreground transition-colors w-56"
        >
          <MagnifyingGlass className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left text-xs truncate">Buscar... (Ctrl+K)</span>
          <kbd className="text-[10px] border border-border rounded px-1 py-0.5 bg-background flex-shrink-0">K</kbd>
        </button>

        {/* Mobile search icon */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandOpen(true)}
          className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Buscar"
        >
          <MagnifyingGlass className="w-4 h-4" />
        </Button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={handleRefresh} aria-label="Actualizar">
          <ArrowClockwise className={`w-4 h-4 transition-transform duration-700 ${spinning ? "rotate-[360deg]" : ""}`} />
        </Button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 hover:bg-accent text-muted-foreground hover:text-foreground relative"
            aria-label={`Alertas${alertCount > 0 ? ` (${alertCount})` : ""}`}
            onClick={() => setNotifOpen((v) => !v)}
          >
            <Bell className="w-4 h-4" />
            {alertCount > 0 && (
              <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 p-0 text-[10px] flex items-center justify-center border-0"
                style={{ background: "var(--destructive)", color: "white" }}>
                {alertCount > 99 ? "99+" : alertCount}
              </Badge>
            )}
          </Button>

          {notifOpen && (
            <>
              {/* Dropdown panel */}
              <div
                role="menu"
                aria-label="Notificaciones"
                className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-border shadow-2xl z-50 overflow-hidden"
                style={{ background: "var(--card)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Notificaciones</span>
                    <p className="text-[10px] text-muted-foreground/60">{fecha}</p>
                  </div>
                  {alertCount > 0 && (
                    <Badge
                      className="text-xs border-0"
                      style={{ background: "var(--destructive)", color: "white" }}
                    >
                      {alertCount}
                    </Badge>
                  )}
                </div>

                {/* Alert list */}
                <div className="divide-y divide-border">
                  {urgentAlerts.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Sin alertas activas
                    </div>
                  ) : (
                    urgentAlerts.map(({ product, tipo }) => {
                      const isAgotado = tipo === "agotado";
                      const isBajoStock = tipo === "bajo_stock";
                      const isPorVencer = tipo === "por_vencer";

                      const dias = isPorVencer && product.fecha_vencimiento
                        ? Math.ceil((new Date(product.fecha_vencimiento).getTime() - now) / 86400000)
                        : null;

                      const urgency = isPorVencer ? vencimientoColor(dias ?? 0) : null;

                      return (
                        <div key={`${product.id}-${tipo}`} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                              background: isAgotado
                                ? "rgba(244,63,94,0.15)"
                                : isBajoStock
                                ? "rgba(245,158,11,0.15)"
                                : urgency!.bg,
                            }}
                          >
                            {isAgotado && <XCircle className="w-4 h-4" style={{ color: "#F43F5E" }} />}
                            {isBajoStock && <WarningOctagon className="w-4 h-4" style={{ color: "#F59E0B" }} />}
                            {isPorVencer && <Clock className="w-4 h-4" style={{ color: urgency!.color }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{product.nombre}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                  isAgotado && "bg-rose-500/15 text-rose-500",
                                  isBajoStock && "bg-amber-500/15 text-amber-500",
                                )}
                                style={isPorVencer ? { background: urgency!.bg, color: urgency!.color } : undefined}
                              >
                                {isAgotado ? "Agotado" : isBajoStock ? "Bajo stock" : urgency!.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {isPorVencer
                                  ? dias !== null && dias < 0
                                    ? "Vencido"
                                    : dias === 0
                                    ? "Vence hoy"
                                    : `${dias}d restantes`
                                  : `${product.stock_actual}/${product.stock_minimo} mín.`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer link */}
                <div className="px-4 py-2.5 border-t border-border bg-muted/40">
                  <Link
                    href="/alertas"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Ver todas las alertas →
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
