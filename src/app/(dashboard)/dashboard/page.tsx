"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Package, TrendUp, WarningOctagon, XCircle,
  ArrowUpRight, ArrowDownRight, CurrencyDollar, Pulse, ArrowRight, CheckCircle,
  ChartPieSlice, ChartLine, Plus,
} from "@phosphor-icons/react";
import { ArrowsLeftRight, Warning } from "@phosphor-icons/react";
import { useData } from "@/lib/store";
import { CategoryIcon } from "@/lib/icon-map";
import { useAuth } from "@/components/auth-provider";
import { isAreaAccessible } from "@/lib/access";
import type { AuthUser } from "@/lib/auth-users";
import type { Product, Category, Movement } from "@/lib/types";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useCountUp } from "@/hooks/use-count-up";
import { useRouter } from "next/navigation";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 11) return `Buenos días, ${name}`;
  if (hour >= 12 && hour <= 18) return `Buenas tardes, ${name}`;
  return `Buenas noches, ${name}`;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function buildValorPorCategoria(scopedProducts: Product[], categories: Category[]) {
  return categories
    .map((cat) => ({
      id: cat.id,
      name: cat.nombre,
      value: scopedProducts.filter((p) => p.categoria_id === cat.id).reduce((s, p) => s + p.stock_actual * p.precio_venta, 0),
      color: cat.color,
    }))
    .filter((c) => c.value > 0);
}

function buildStatCards(
  user: AuthUser,
  scopedProducts: Product[],
  scopedMovements: Movement[],
  allProducts: Product[],
  allMovements: Movement[],
  allCategories: Category[]
) {
  if (user.role === "admin") {
    const totalProductos = allProducts.length;
    const valorTotalInventario = allProducts.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0);
    const productosBajoStock = allProducts.filter((p) => p.estado === "bajo_stock").length;
    const productosAgotados = allProducts.filter((p) => p.estado === "agotado").length;
    const movimientosHoy = allMovements.filter(
      (m) => new Date(m.created_at).toDateString() === new Date().toDateString()
    ).length;
    const categoriasCount = allCategories.length;
    const now = new Date();
    const nuevosEsteMes = allProducts.filter((p) => {
      const d = new Date(p.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const unidadesTotales = allProducts.reduce((s, p) => s + p.stock_actual, 0);

    return [
      { label: "Total de Bienes", value: totalProductos, icon: Package, color: "#7C3AED", bg: "rgba(124,58,237,0.15)", change: nuevosEsteMes > 0 ? `+${nuevosEsteMes} este mes` : "Sin altas este mes", up: nuevosEsteMes > 0, href: "/productos" },
      { label: "Valor Patrimonial", value: `$${valorTotalInventario.toLocaleString()}`, icon: CurrencyDollar, color: "#14B8A6", bg: "rgba(20,184,166,0.15)", change: `${unidadesTotales.toLocaleString()} unidades`, up: true, href: "/reportes" },
      { label: "Existencias Bajas", value: productosBajoStock, icon: WarningOctagon, color: "#F59E0B", bg: "rgba(245,158,11,0.15)", change: "Requiere atención", up: false, href: "/alertas" },
      { label: "Agotados", value: productosAgotados, icon: XCircle, color: "#F43F5E", bg: "rgba(244,63,94,0.15)", change: "Reponer existencias", up: false, href: "/alertas" },
      { label: "Movimientos Hoy", value: movimientosHoy, icon: Pulse, color: "#A78BFA", bg: "rgba(167,139,250,0.15)", change: `${allMovements.length} operaciones`, up: true, href: "/movimientos" },
      { label: "Categorías", value: categoriasCount, icon: TrendUp, color: "#8B5CF6", bg: "rgba(139,92,246,0.15)", change: "Todas activas", up: true, href: "/categorias" },
    ];
  }

  const valor = scopedProducts.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0);
  const bajoStock = scopedProducts.filter((p) => p.estado === "bajo_stock").length;
  const agotados = scopedProducts.filter((p) => p.estado === "agotado").length;
  const categorias = new Set(scopedProducts.map((p) => p.categoria_id)).size;

  return [
    { label: "Bienes de mi Área", value: scopedProducts.length, icon: Package, color: "#7C3AED", bg: "rgba(124,58,237,0.15)", change: user.area ?? "", up: true, href: "/productos" },
    { label: "Valor de mi Área", value: `$${valor.toLocaleString()}`, icon: CurrencyDollar, color: "#14B8A6", bg: "rgba(20,184,166,0.15)", change: "Valor actual", up: true, href: "/reportes" },
    { label: "Existencias Bajas", value: bajoStock, icon: WarningOctagon, color: "#F59E0B", bg: "rgba(245,158,11,0.15)", change: "Requiere atención", up: false, href: "/alertas" },
    { label: "Agotados", value: agotados, icon: XCircle, color: "#F43F5E", bg: "rgba(244,63,94,0.15)", change: "Reponer existencias", up: false, href: "/alertas" },
    { label: "Movimientos", value: scopedMovements.length, icon: Pulse, color: "#A78BFA", bg: "rgba(167,139,250,0.15)", change: "Registrados", up: true, href: "/movimientos" },
    { label: "Categorías", value: categorias, icon: TrendUp, color: "#3B82F6", bg: "rgba(59,130,246,0.15)", change: "En uso", up: true, href: "/categorias" },
  ];
}

function AnimatedValue({ value }: { value: string | number }) {
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""))
  const isNumeric = !isNaN(numeric) && typeof value === "number"
  const animated = useCountUp(isNumeric ? numeric : 0)
  if (!isNumeric) return <>{value}</>
  return <>{animated.toLocaleString()}</>
}

export default function DashboardPage() {
  const user = useAuth();
  const router = useRouter();
  const { products, movements, categories } = useData();

  const greeting = getGreeting(user.nombre);

  const scopedProducts = user.role === "admin" ? products : products.filter((p) => isAreaAccessible(user, p.area));
  const scopedMovements = user.role === "admin" ? movements : movements.filter((m) => isAreaAccessible(user, m.producto?.area));
  const STAT_CARDS = buildStatCards(user, scopedProducts, scopedMovements, products, movements, categories);
  const valorPorCategoria = buildValorPorCategoria(scopedProducts, categories);
  const bajosStock = scopedProducts.filter((p) => p.estado === "bajo_stock" || p.estado === "agotado");

  useKeyboardShortcuts([
    { key: "n", ignoreInputs: true, onTrigger: () => router.push("/productos") },
    { key: "m", ignoreInputs: true, onTrigger: () => router.push("/movimientos") },
  ]);

  const movimientosSemana = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - 6 + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayMovs = scopedMovements.filter((m) => m.created_at.slice(0, 10) === dateStr);
      return {
        dia: DAY_LABELS[d.getDay()],
        entradas: dayMovs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.cantidad, 0),
        salidas: dayMovs.filter((m) => m.tipo === "salida").reduce((s, m) => s + m.cantidad, 0),
      };
    });
  }, [scopedMovements]);

  const semanaSinMovimientos = movimientosSemana.every((d) => d.entradas === 0 && d.salidas === 0);
  const sinBienesRegistrados = user.role !== "admin" && scopedProducts.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar title="Dashboard" subtitle={greeting} />

      <div className="p-6 space-y-6">

        {/* Welcome / empty-inventory prompt — new areas with nothing registered yet */}
        {sinBienesRegistrados && (
          <Card className="border-primary/25 relative overflow-hidden animate-in fade-in slide-in-from-bottom-1"
            style={{ background: "linear-gradient(135deg, var(--card) 60%, var(--accent))" }}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-primary-foreground"
                style={{ background: "var(--primary)" }}>
                <Package className="w-5.5 h-5.5" weight="duotone" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Aún no hay bienes registrados en {user.area ?? "tu área"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Agrega el primer bien patrimonial para empezar a ver aquí tus indicadores.</p>
              </div>
              <Link href="/productos" className="flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium rounded-lg text-primary-foreground transition-transform active:scale-95"
                  style={{ background: "var(--primary)" }}>
                  <Plus className="w-3.5 h-3.5" weight="bold" /> Agregar bien
                </span>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, change, up, href }, i) => (
            <Link key={label} href={href} className="block group/card">
              <Card
                className="border-border relative overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200 animate-in fade-in slide-in-from-bottom-1 cursor-pointer"
                style={{
                  animationDelay: `${i * 50}ms`,
                  animationFillMode: "backwards",
                  background: `linear-gradient(135deg, var(--card) 40%, ${bg})`,
                }}>
                <div className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: color }} />
                <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10 blur-xl" style={{ background: color }} />
                <CardContent className="p-4 pl-5 relative">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                      <Icon className="w-3.5 h-3.5 transition-colors" style={{ color }} />
                    </div>
                    {up
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-teal-500" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                  <p className="text-2xl font-bold text-foreground leading-none"><AnimatedValue value={value} /></p>
                  <p className="text-xs mt-1.5 text-muted-foreground">{label}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: up ? "#14B8A6" : "#F59E0B" }}>{change}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Nuevo bien", icon: Plus, href: "/productos", color: "#7C3AED", bg: "rgba(124,58,237,0.12)", hint: "N" },
            { label: "Registrar movimiento", icon: ArrowsLeftRight, href: "/movimientos", color: "#10B981", bg: "rgba(16,185,129,0.12)", hint: "M" },
            { label: "Ver alertas", icon: Warning, href: "/alertas", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", hint: null },
          ].map(({ label, icon: Icon, href, color, bg, hint }) => (
            <Link key={label} href={href}
              className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/20 hover:bg-accent/60 hover:shadow-sm transition-all group animate-in fade-in slide-in-from-bottom-1"
              style={{ background: "var(--card)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} weight="duotone" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">{label}</span>
              {hint && (
                <kbd className="hidden sm:flex text-[10px] border border-border rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-mono">
                  {hint}
                </kbd>
              )}
            </Link>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Movements chart */}
          <Card className="xl:col-span-2 border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Movimientos de la Semana</CardTitle>
            </CardHeader>
            <CardContent>
              {semanaSinMovimientos ? (
                <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-muted">
                    <ChartLine className="w-6 h-6 text-muted-foreground/50" weight="duotone" />
                  </div>
                  <p className="text-sm text-muted-foreground">Sin movimientos esta semana</p>
                  <p className="text-xs text-muted-foreground/60">Las entradas y salidas registradas aparecerán aquí</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={movimientosSemana}>
                      <defs>
                        <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSalidas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="dia" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--popover-foreground)" }} />
                      <Area type="monotone" dataKey="entradas" stroke="#7C3AED" strokeWidth={2} fill="url(#colorEntradas)" name="Entradas" />
                      <Area type="monotone" dataKey="salidas" stroke="#14B8A6" strokeWidth={2} fill="url(#colorSalidas)" name="Salidas" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-600" /><span className="text-xs text-muted-foreground">Entradas</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-teal-500" /><span className="text-xs text-muted-foreground">Salidas</span></div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pie chart */}
          <Card className="border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Valor por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {valorPorCategoria.length === 0 ? (
                <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-center">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-muted">
                    <ChartPieSlice className="w-5.5 h-5.5 text-muted-foreground/50" weight="duotone" />
                  </div>
                  <p className="text-xs text-muted-foreground">Sin bienes con valor asignado aún</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={valorPorCategoria} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                        paddingAngle={3} dataKey="value">
                        {valorPorCategoria.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--popover-foreground)" }}
                        formatter={(v) => [`$${Number(v).toLocaleString()}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-1">
                    {valorPorCategoria.map((cat) => (
                      <div key={cat.id} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{cat.name}</span>
                        <span className="text-xs font-medium text-foreground">${cat.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Alertas stock */}
          <Card className="border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">Alertas de Stock</CardTitle>
                <div className="flex items-center gap-2">
                  {bajosStock.length > 0
                    ? <Badge variant="destructive" className="text-xs">{bajosStock.length} alertas</Badge>
                    : <Badge className="text-xs border-0 bg-teal-500/15 text-teal-500">Sin alertas</Badge>
                  }
                  <Link href="/alertas" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Ver todas <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {bajosStock.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle className="w-8 h-8 text-teal-500" weight="duotone" />
                  <p className="text-sm font-medium text-teal-500">Sin alertas de stock</p>
                  <p className="text-xs text-muted-foreground">Todas las existencias están en nivel adecuado</p>
                </div>
              ) : bajosStock.slice(0, 5).map((p) => {
                const pct = p.stock_maximo > 0 ? (p.stock_actual / p.stock_maximo) * 100 : 0;
                const isAgotado = p.estado === "agotado";
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <CategoryIcon name={p.categoria?.icono} className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{p.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{p.stock_actual}/{p.stock_maximo}</span>
                        <Badge variant={isAgotado ? "destructive" : "secondary"}
                          className={!isAgotado ? "bg-amber-500/20 text-amber-400 border-0 text-xs" : "text-xs"}>
                          {isAgotado ? "Agotado" : "Bajo"}
                        </Badge>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5"
                      style={{ background: "var(--muted)" }} />
                  </div>
                );
              })}
              {bajosStock.length > 5 && (
                <Link href="/alertas" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline pt-1 pb-0.5">
                  +{bajosStock.length - 5} más <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Últimos movimientos */}
          <Card className="border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">Últimos Movimientos</CardTitle>
                <Link href="/movimientos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {scopedMovements.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">Sin movimientos registrados</p>
                  <p className="text-xs text-muted-foreground/60">Las entradas y salidas registradas aparecerán aquí</p>
                  <Link href="/movimientos" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    <Plus className="w-3.5 h-3.5" weight="bold" /> Registrar movimiento
                  </Link>
                </div>
              )}
              {[...scopedMovements].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((mov) => (
                <div key={mov.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mov.tipo === "entrada" ? "bg-teal-500/15" :
                    mov.tipo === "salida" ? "bg-rose-500/15" : "bg-purple-500/15"
                  }`}>
                    {mov.tipo === "entrada"
                      ? <ArrowUpRight className="w-4 h-4 text-teal-500" />
                      : mov.tipo === "salida"
                      ? <ArrowDownRight className="w-4 h-4 text-rose-500" />
                      : <Pulse className="w-4 h-4 text-purple-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{mov.producto?.nombre}</p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{mov.motivo} · {mov.usuario_nombre}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${
                      mov.tipo === "entrada" ? "text-teal-500" : mov.tipo === "salida" ? "text-rose-500" : "text-purple-500"
                    }`}>
                      {mov.tipo === "entrada" ? "+" : mov.tipo === "salida" ? "-" : "~"}{mov.cantidad}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {(() => {
                        const d = new Date(mov.created_at);
                        return d.toDateString() === new Date().toDateString()
                          ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                          : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
                      })()}
                    </p>
                  </div>
                </div>
              ))}
              {scopedMovements.length > 5 && (
                <Link href="/movimientos" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline pt-1 pb-0.5">
                  +{scopedMovements.length - 5} más <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
