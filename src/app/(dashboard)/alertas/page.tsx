"use client";

import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { WarningOctagon, XCircle, Clock, CheckCircle, ArrowCounterClockwise, PaperPlaneTilt, Eye } from "@phosphor-icons/react";
import { useData } from "@/lib/store";
import { CategoryIcon } from "@/lib/icon-map";
import { useAuth } from "@/components/auth-provider";
import { isAreaAccessible } from "@/lib/access";
import { useToast } from "@/components/ui/toast";
import { MovimientoForm } from "@/components/movimiento-form";
import { useState } from "react";
import type { Product } from "@/lib/types";

export default function AlertasPage() {
  const user = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { products } = useData();
  const [now] = useState(() => Date.now());
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const scopedProducts = user.role === "admin" ? products : products.filter((p) => isAreaAccessible(user, p.area));
  const agotados = scopedProducts
    .filter((p) => p.estado === "agotado")
    .sort((a, b) => a.stock_actual - b.stock_actual);
  const bajoStock = scopedProducts
    .filter((p) => p.estado === "bajo_stock")
    .sort((a, b) => {
      const ra = a.stock_minimo > 0 ? a.stock_actual / a.stock_minimo : 1;
      const rb = b.stock_minimo > 0 ? b.stock_actual / b.stock_minimo : 1;
      return ra - rb;
    });
  const porVencer = scopedProducts
    .filter((p) => {
      if (!p.fecha_vencimiento) return false;
      const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - now) / 86400000);
      return dias <= 7;
    })
    .sort((a, b) => {
      const da = Math.ceil((new Date(a.fecha_vencimiento!).getTime() - now) / 86400000);
      const db = Math.ceil((new Date(b.fecha_vencimiento!).getTime() - now) / 86400000);
      return da - db;
    });

  function diasRestantes(fecha: string) {
    return Math.ceil((new Date(fecha).getTime() - now) / 86400000);
  }

  function vencimientoUrgency(dias: number) {
    if (dias < 0)  return { color: "#F43F5E", bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.25)", label: "Vencido" };
    if (dias === 0) return { color: "#F97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.25)", label: "Vence hoy" };
    if (dias <= 2)  return { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", label: `${dias}d restantes` };
    return          { color: "#A78BFA", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)", label: `${dias}d restantes` };
  }

  const sections = [
    {
      title: "Bienes Agotados",
      items: agotados,
      icon: XCircle,
      color: "#F43F5E",
      bg: "rgba(244,63,94,0.1)",
      border: "rgba(244,63,94,0.2)",
      action: "Reponer",
      actionIcon: ArrowCounterClockwise,
      restock: true,
    },
    {
      title: "Existencias Bajas",
      items: bajoStock,
      icon: WarningOctagon,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.1)",
      border: "rgba(245,158,11,0.2)",
      action: "Solicitar",
      actionIcon: PaperPlaneTilt,
      restock: true,
    },
    {
      title: "Garantías por Vencer (7 días)",
      items: porVencer,
      icon: Clock,
      color: "#A78BFA",
      bg: "rgba(167,139,250,0.1)",
      border: "rgba(167,139,250,0.2)",
      action: "Revisar",
      actionIcon: Eye,
      restock: false,
    },
  ];

  const totalAlertas = agotados.length + bajoStock.length + porVencer.length;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar title="Alertas" subtitle={`${totalAlertas} alertas activas`} />

      <div className="p-6 space-y-6">

        {/* All-clear state */}
        {totalAlertas === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-teal-500/15">
              <CheckCircle className="w-8 h-8 text-teal-500" weight="duotone" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Todo en orden</p>
              <p className="text-sm text-muted-foreground mt-1">No hay bienes agotados, con stock bajo ni garantías por vencer.</p>
            </div>
          </div>
        )}

        {/* Summary + sections (hidden when all clear) */}
        {totalAlertas > 0 && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Agotados", count: agotados.length, color: "#F43F5E", bg: "rgba(244,63,94,0.15)", icon: XCircle },
            { label: "Existencias Bajas", count: bajoStock.length, color: "#F59E0B", bg: "rgba(245,158,11,0.15)", icon: WarningOctagon },
            { label: "Garantías por Vencer", count: porVencer.length, color: "#A78BFA", bg: "rgba(167,139,250,0.15)", icon: Clock },
          ].map(({ label, count, color, bg, icon: Icon }, i) => (
            <Card key={label}
              className="border-border hover:shadow-md hover:-translate-y-0.5 transition-all animate-in fade-in slide-in-from-bottom-1"
              style={{ background: "var(--card)", animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>}

        {/* Alert sections */}
        {totalAlertas > 0 && sections.map(({ title, items, icon: Icon, color, bg, border, action, actionIcon: ActionIcon, restock }, si) => {
          const isVencimiento = title.startsWith("Garantías");
          return (
            <Card key={title}
              className="border-border hover:shadow-md transition-shadow animate-in fade-in slide-in-from-bottom-1"
              style={{ background: "var(--card)", animationDelay: `${180 + si * 80}ms`, animationFillMode: "backwards" }}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                    <Icon className="w-3.5 h-3.5" weight="duotone" style={{ color }} />
                  </div>
                  <CardTitle className="text-sm text-foreground">{title}</CardTitle>
                  <Badge className="text-xs border-0 ml-1" style={{ background: bg, color }}>
                    {items.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {items.length === 0 ? (
                  <div className="text-center py-8 flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8 text-teal-500/40" />
                    <p className="text-sm text-muted-foreground">Sin alertas en esta categoría</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((product) => {
                      const pct = product.stock_maximo > 0 ? (product.stock_actual / product.stock_maximo) * 100 : 0;
                      const dias = product.fecha_vencimiento ? diasRestantes(product.fecha_vencimiento) : null;
                      const urgency = isVencimiento && dias !== null ? vencimientoUrgency(dias) : null;
                      const itemBg = urgency?.bg ?? bg;
                      const itemBorder = urgency?.border ?? border;
                      const itemColor = urgency?.color ?? color;
                      return (
                        <div key={product.id} className="flex items-center gap-4 p-3 rounded-xl border transition-all hover:shadow-sm"
                          style={{ background: itemBg, borderColor: itemBorder }}>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "color-mix(in srgb, var(--foreground) 15%, transparent)" }}>
                            <CategoryIcon name={product.categoria?.icono} className="w-4.5 h-4.5" style={{ color: itemColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium text-foreground text-sm truncate">{product.nombre}</p>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                {isVencimiento ? (
                                  <span className="text-xs font-bold" style={{ color: dias !== null ? vencimientoUrgency(dias).color : color }}>
                                    {dias !== null ? vencimientoUrgency(dias).label : "—"}
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold" style={{ color }}>
                                    {product.stock_actual}/{product.stock_minimo} mín.
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => restock ? setRestockTarget(product) : router.push(`/productos?view=${product.id}`)}
                                  aria-label={`${action} ${product.nombre}`}
                                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg text-white transition-all active:scale-95"
                                  style={{ background: itemColor }}
                                  onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; e.currentTarget.style.boxShadow = `0 2px 8px ${itemColor}55`; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.filter = ""; e.currentTarget.style.boxShadow = ""; }}
                                >
                                  <ActionIcon className="w-3 h-3" weight="bold" />
                                  {action}
                                </button>
                              </div>
                            </div>
                            {isVencimiento ? (
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">{product.proveedor}</span>
                                <span className="text-xs text-muted-foreground">
                                  Vence: {product.fecha_vencimiento ? new Date(product.fecha_vencimiento).toLocaleDateString("es-MX") : "—"}
                                </span>
                              </div>
                            ) : (
                              <>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--foreground) 15%, transparent)" }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: itemColor }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-xs text-muted-foreground">{product.proveedor}</span>
                                  <span className="text-xs text-muted-foreground">{product.ubicacion}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick restock dialog — pre-fills the movement form with the alerted product */}
      <Dialog open={!!restockTarget} onOpenChange={(o) => { if (!o) setRestockTarget(null); }}>
        <DialogContent className="max-w-lg border-border text-foreground" style={{ background: "var(--card)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Registrar reabastecimiento</DialogTitle>
          </DialogHeader>
          {restockTarget && (
            <MovimientoForm
              products={scopedProducts}
              user={user}
              defaultProductId={restockTarget.id}
              defaultTipo="entrada"
              onClose={() => setRestockTarget(null)}
              onSaved={() => toast("Movimiento registrado correctamente")}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
