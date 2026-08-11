"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, MagnifyingGlass, ClipboardText, ArrowUpRight, ArrowDownRight,
  DownloadSimple, Prohibit, X,
} from "@phosphor-icons/react";
import { CategoryIcon } from "@/lib/icon-map";
import { useAuth } from "@/components/auth-provider";
import { isAreaAccessible } from "@/lib/access";
import { useData } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";
import { MovimientoForm, TIPO_CONFIG } from "@/components/movimiento-form";
import type { MovementType } from "@/lib/types";

function MovimientosSkeleton() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      <div className="h-16 bg-muted border-b border-border" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}
        </div>
        <div className="h-14 rounded-xl bg-muted" />
        {[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted" />)}
      </div>
    </div>
  );
}

export default function MovimientosPage() {
  return (
    <Suspense fallback={<MovimientosSkeleton />}>
      <MovimientosContent />
    </Suspense>
  );
}

function MovimientosContent() {
  const searchParams = useSearchParams();
  const user = useAuth();
  const router = useRouter();
  const { products, movements, deleteMovement } = useData();
  const { toast } = useToast();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [filterTipo, setFilterTipo] = useState(searchParams.get("tipo") ?? "todos");
  const [fechaDesde, setFechaDesde] = useState(searchParams.get("desde") ?? "");
  const [fechaHasta, setFechaHasta] = useState(searchParams.get("hasta") ?? "");
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteMovId, setDeleteMovId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [exportOpen, setExportOpen] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const closeExport = useCallback(() => setExportOpen(false), []);
  const exportMenuRef = useDismissableMenu<HTMLDivElement>(exportOpen, closeExport);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterTipo !== "todos") params.set("tipo", filterTipo);
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    const qs = params.toString();
    router.replace(qs ? `/movimientos?${qs}` : "/movimientos", { scroll: false });
  }, [search, filterTipo, fechaDesde, fechaHasta, router]);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  // Reset to page 1 when filters change — adjusted during render (not an effect).
  const [prevFilters, setPrevFilters] = useState({ search, filterTipo, fechaDesde, fechaHasta });
  if (prevFilters.search !== search || prevFilters.filterTipo !== filterTipo ||
      prevFilters.fechaDesde !== fechaDesde || prevFilters.fechaHasta !== fechaHasta) {
    setPrevFilters({ search, filterTipo, fechaDesde, fechaHasta });
    setPage(1);
  }

  const scopedMovements = user.role === "admin"
    ? movements
    : movements.filter((m) => isAreaAccessible(user, m.producto?.area));
  const scopedProducts = user.role === "admin"
    ? products
    : products.filter((p) => isAreaAccessible(user, p.area));

  const summary = (["entrada", "salida", "ajuste", "transferencia"] as MovementType[]).map((tipo) => {
    const items = scopedMovements.filter((m) => m.tipo === tipo);
    return { tipo, total: items.length, qty: items.reduce((s, m) => s + m.cantidad, 0) };
  }).filter((s) => s.total > 0);

  const filtered = scopedMovements.filter((m) => {
    const matchSearch =
      m.producto?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      m.referencia?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === "todos" || m.tipo === filterTipo;
    const fecha = new Date(m.created_at);
    const matchDesde = !fechaDesde || fecha >= new Date(fechaDesde);
    const matchHasta = !fechaHasta || fecha <= new Date(fechaHasta + "T23:59:59");
    return matchSearch && matchTipo && matchDesde && matchHasta;
  });

  const maxPage = Math.max(1, Math.ceil(filtered.length / perPage));
  if (page > maxPage) {
    setPage(maxPage);
  }

  const hasFilters = search || filterTipo !== "todos" || fechaDesde || fechaHasta;

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        let av: string | number = "", bv: string | number = "";
        if (sortField === "tipo")     { av = a.tipo; bv = b.tipo; }
        if (sortField === "producto") { av = a.producto?.nombre ?? ""; bv = b.producto?.nombre ?? ""; }
        if (sortField === "cantidad") { av = a.cantidad; bv = b.cantidad; }
        if (sortField === "fecha")    { av = a.created_at; bv = b.created_at; }
        const cmp = typeof av === "number" ? av - (bv as number) : (av as string).localeCompare(bv as string, "es");
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  function handleAnular() {
    if (!deleteMovId) return;
    deleteMovement(deleteMovId);
    setDeleteMovId(null);
    toast("Movimiento anulado. Stock restaurado.", "info");
  }

  const anularTarget = movements.find((m) => m.id === deleteMovId);

  function handleExportCSV() {
    const headers = ["Tipo", "Producto", "Código", "Cantidad", "Stock Ant.", "Stock Nuevo", "Motivo", "Referencia", "Usuario", "Fecha"];
    const rows = filtered.map((m) => [
      TIPO_CONFIG[m.tipo].label, m.producto?.nombre ?? "", m.producto?.codigo ?? "",
      String(m.cantidad), String(m.stock_anterior), String(m.stock_nuevo),
      m.motivo ?? "", m.referencia ?? "", m.usuario_nombre,
      new Date(m.created_at).toLocaleString("es-MX"),
    ]);
    downloadCSV(`movimientos_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast("CSV exportado correctamente");
  }

  function handleExportExcel() {
    const headers = ["Tipo", "Producto", "Código", "Cantidad", "Stock Ant.", "Stock Nuevo", "Motivo", "Referencia", "Usuario", "Fecha"];
    const rows = filtered.map((m) => [
      TIPO_CONFIG[m.tipo].label, m.producto?.nombre ?? "", m.producto?.codigo ?? "",
      m.cantidad, m.stock_anterior, m.stock_nuevo,
      m.motivo ?? "", m.referencia ?? "", m.usuario_nombre,
      new Date(m.created_at).toLocaleString("es-MX"),
    ]);
    downloadExcel(`movimientos_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows);
    toast("Excel exportado correctamente");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar title="Movimientos" subtitle="Registro de entradas, salidas y ajustes" />

      <div className="p-6 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summary.map(({ tipo, total, qty }, i) => {
            const cfg = TIPO_CONFIG[tipo];
            return (
              <Card key={tipo}
                className="border-border relative overflow-hidden group hover:shadow-lg hover:-translate-y-1 transition-all duration-200 animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards", background: `linear-gradient(135deg, var(--card) 40%, ${cfg.hexBg})` }}>
                <div className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: cfg.hex }} />
                <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10 blur-xl" style={{ background: cfg.hex }} />
                <CardContent className="p-4 pl-5 relative">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cfg.hexBg }}>
                      <span style={{ color: cfg.hex }}>{cfg.icon}</span>
                    </div>
                    {tipo === "entrada"
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-teal-500" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 opacity-70" />}
                  </div>
                  <p className="text-2xl font-bold text-foreground leading-none">{qty}</p>
                  <p className="text-xs mt-1 text-muted-foreground">{cfg.label}s</p>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: cfg.hex }}>{total} operación{total !== 1 ? "es" : ""}</p>
                  {(fechaDesde || fechaHasta) && (
                    <p className="text-[10px] mt-1 text-muted-foreground/50">Total histórico</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Toolbar */}
        <Card className="border-border" style={{ background: "var(--card)" }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por producto o referencia..."
                  className="pl-10 pr-8 h-9 bg-muted/60 border-border text-foreground placeholder:text-muted-foreground"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCSV}
                disabled={filtered.length === 0}
                className="h-9 gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 hidden sm:flex disabled:opacity-40 disabled:cursor-not-allowed">
                <DownloadSimple className="w-4 h-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel}
                disabled={filtered.length === 0}
                className="h-9 gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 hidden sm:flex disabled:opacity-40 disabled:cursor-not-allowed">
                <DownloadSimple className="w-4 h-4" /> Excel
              </Button>
              {/* Mobile export dropdown */}
              <div className="relative sm:hidden" ref={exportMenuRef}>
                <Button variant="outline" size="sm"
                  aria-label="Exportar"
                  onClick={() => setExportOpen((v) => !v)}
                  className="h-9 w-9 p-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0">
                  <DownloadSimple className="w-4 h-4" />
                </Button>
                {exportOpen && (
                  <div role="menu" aria-label="Exportar" className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-border shadow-lg overflow-hidden"
                    style={{ background: "var(--card)", minWidth: 120 }}>
                    <button onClick={() => { handleExportCSV(); setExportOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2">
                      <DownloadSimple className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button onClick={() => { handleExportExcel(); setExportOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2">
                      <DownloadSimple className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                )}
              </div>
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger render={
                  <Button className="h-9 gap-2 shrink-0 text-primary-foreground" style={{ background: "var(--primary)" }} />
                }>
                  <Plus className="w-4 h-4" weight="bold" /> Registrar
                </DialogTrigger>
                <DialogContent className="max-w-lg border-border text-foreground" style={{ background: "var(--card)" }}>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Registrar Movimiento</DialogTitle>
                  </DialogHeader>
                  <MovimientoForm
                    products={scopedProducts}
                    user={user}
                    onClose={() => setOpenDialog(false)}
                    onSaved={() => { toast("Movimiento registrado correctamente"); setPage(1); }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v ?? "todos")}
                items={{ todos: "Todos los tipos", ...Object.fromEntries((["entrada", "salida", "ajuste", "transferencia"] as MovementType[]).map((t) => [t, TIPO_CONFIG[t].label])) }}>
                <SelectTrigger className="h-8 text-xs bg-muted/60 border-border text-foreground w-40">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent className="border-border" style={{ background: "var(--card)" }}>
                  <SelectItem value="todos" className="text-foreground text-xs">Todos los tipos</SelectItem>
                  {(["entrada", "salida", "ajuste", "transferencia"] as MovementType[]).map((t) => (
                    <SelectItem key={t} value={t} className="text-foreground text-xs">
                      <span className="flex items-center gap-2">
                        <span style={{ color: TIPO_CONFIG[t].hex }}>{TIPO_CONFIG[t].icon}</span>
                        {TIPO_CONFIG[t].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Desde</span>
                <DateInput className="w-44" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                <span className="text-muted-foreground/50 text-xs select-none">→</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Hasta</span>
                <DateInput className="w-44" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {filterTipo !== "todos" && (
                  <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium border"
                    style={{ background: `${TIPO_CONFIG[filterTipo as MovementType].hexBg}`, color: TIPO_CONFIG[filterTipo as MovementType].hex, borderColor: `${TIPO_CONFIG[filterTipo as MovementType].hex}40` }}>
                    {TIPO_CONFIG[filterTipo as MovementType].label}
                    <button type="button" onClick={() => setFilterTipo("todos")} aria-label="Quitar filtro de tipo">
                      <X className="w-2.5 h-2.5 opacity-70 hover:opacity-100" />
                    </button>
                  </span>
                )}
                {(fechaDesde || fechaHasta) && (
                  <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                    {fechaDesde || "inicio"} → {fechaHasta || "hoy"}
                    <button type="button" onClick={() => { setFechaDesde(""); setFechaHasta(""); }} aria-label="Quitar filtro de fechas">
                      <X className="w-2.5 h-2.5 opacity-70 hover:opacity-100" />
                    </button>
                  </span>
                )}
                {search && (
                  <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                    &quot;{search}&quot;
                    <button type="button" onClick={() => setSearch("")} aria-label="Quitar búsqueda">
                      <X className="w-2.5 h-2.5 opacity-70 hover:opacity-100" />
                    </button>
                  </span>
                )}
              </div>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} de {scopedMovements.length} registros
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
          <CardContent className="p-0">
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {paginated.map((mov) => {
                const cfg = TIPO_CONFIG[mov.tipo];
                return (
                  <div key={mov.id} className="p-4 flex items-start gap-3 hover:bg-accent/30 transition-colors">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: cfg.hexBg }}>
                      <span style={{ color: cfg.hex }}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-foreground truncate">{mov.producto?.nombre}</p>
                        <span className="text-sm font-bold flex-shrink-0" style={{ color: cfg.hex }}>
                          {mov.tipo === "entrada" ? "+" : mov.tipo === "salida" ? "−" : "±"}{mov.cantidad}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{mov.producto?.codigo}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>{mov.motivo || cfg.label}</p>
                          <p className="font-mono">{mov.stock_anterior} → <span className="text-foreground font-semibold">{mov.stock_nuevo}</span></p>
                        </div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">
                            {new Date(mov.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                          </p>
                          <Button variant="ghost" size="icon"
                            className="h-7 w-7 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                            aria-label={`Anular movimiento de ${mov.producto?.nombre ?? "producto"}`}
                            onClick={() => setDeleteMovId(mov.id)}>
                            <Prohibit className="w-3 h-3" weight="duotone" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <SortTh label="Tipo" field="tipo" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="pl-6" />
                    <SortTh label="Producto" field="producto" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Cantidad" field="cantidad" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-center" />
                    <TableHead className="text-muted-foreground font-medium text-center">Ant. → Nuevo</TableHead>
                    <TableHead className="text-muted-foreground font-medium">Motivo</TableHead>
                    <TableHead className="text-muted-foreground font-medium">Referencia</TableHead>
                    <TableHead className="text-muted-foreground font-medium">Usuario</TableHead>
                    <SortTh label="Fecha" field="fecha" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <TableHead className="text-muted-foreground font-medium text-center pr-4">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((mov, i) => {
                    const cfg = TIPO_CONFIG[mov.tipo];
                    return (
                      <TableRow key={mov.id}
                        onClick={() => mov.producto_id && router.push(`/productos?view=${mov.producto_id}`)}
                        className="border-border hover:bg-accent/60 transition-colors animate-in fade-in cursor-pointer"
                        style={{
                          animationDelay: `${Math.min(i, 12) * 30}ms`,
                          animationFillMode: "backwards",
                          background: i % 2 === 1 ? "color-mix(in oklch, var(--muted) 35%, transparent)" : undefined,
                        }}>
                        <TableCell className="pl-6">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: cfg.hexBg, color: cfg.hex }}>
                            {cfg.icon} {cfg.label}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CategoryIcon name={mov.producto?.categoria?.icono} className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground leading-tight">{mov.producto?.nombre}</p>
                              <p className="text-xs text-muted-foreground font-mono">{mov.producto?.codigo}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-bold text-sm" style={{ color: cfg.hex }}>
                            {mov.tipo === "entrada" ? "+" : mov.tipo === "salida" ? "−" : "±"}{mov.cantidad}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground font-mono">
                            {mov.stock_anterior} → <span className="text-foreground font-semibold">{mov.stock_nuevo}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-32 truncate">{mov.motivo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{mov.referencia || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{mov.usuario_nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(mov.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                        <TableCell className="text-center pr-4">
                          <Button variant="ghost" size="icon"
                            className="h-7 w-7 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                            title="Anular movimiento"
                            aria-label={`Anular movimiento de ${mov.producto?.nombre ?? "producto"}`}
                            onClick={(e) => { e.stopPropagation(); setDeleteMovId(mov.id); }}>
                            <Prohibit className="w-3.5 h-3.5" weight="duotone" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-20 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner"
                  style={{ background: "var(--muted)" }}>
                  <ClipboardText className="w-8 h-8 text-muted-foreground/50" weight="duotone" />
                </div>
                <div className="space-y-1">
                  <p className="text-foreground font-semibold text-sm">
                    {hasFilters ? "Sin resultados" : "Aún no hay movimientos"}
                  </p>
                  <p className="text-muted-foreground text-xs max-w-xs">
                    {hasFilters
                      ? "No hay movimientos que coincidan con los filtros aplicados."
                      : "Registra entradas, salidas y ajustes para llevar el historial del inventario."}
                  </p>
                </div>
                {hasFilters ? (
                  <Button variant="outline" size="sm"
                    onClick={() => { setSearch(""); setFilterTipo("todos"); setFechaDesde(""); setFechaHasta(""); }}
                    className="text-xs gap-1.5 border-border">
                    <X className="w-3 h-3" /> Limpiar filtros
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenDialog(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold text-primary-foreground transition-all active:scale-95 shadow-sm"
                    style={{ background: "var(--primary)" }}
                  >
                    <Plus className="w-3.5 h-3.5" weight="bold" /> Registrar primer movimiento
                  </button>
                )}
              </div>
            )}
            {filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
                <span>{filtered.length} movimiento{filtered.length !== 1 ? "s" : ""} filtrados</span>
                <div className="flex items-center gap-4">
                  {(["entrada", "salida"] as MovementType[]).map((tipo) => {
                    const total = filtered.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.cantidad, 0);
                    if (!total) return null;
                    const cfg = TIPO_CONFIG[tipo];
                    return (
                      <span key={tipo} className="font-medium" style={{ color: cfg.hex }}>
                        {cfg.label}s: {total.toLocaleString()}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <Pagination
              total={filtered.length}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteMovId}
        title="Anular movimiento"
        description={`¿Anular este movimiento de ${anularTarget ? `${TIPO_CONFIG[anularTarget.tipo].label.toLowerCase()} de ${anularTarget.cantidad} ${anularTarget.producto?.unidad ?? "unidades"}` : ""}? El stock del producto será restaurado al valor anterior.`}
        confirmLabel="Anular"
        destructive
        onConfirm={handleAnular}
        onCancel={() => setDeleteMovId(null)}
      />
    </div>
  );
}

// ─── Sort header ─────────────────────────────────────────────────────────────

function SortTh({ label, field, sortField, sortDir, onSort, className }: {
  label: string; field: string; sortField: string | null;
  sortDir: "asc" | "desc"; onSort: (f: string) => void; className?: string;
}) {
  const active = sortField === field;
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(field)}
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors group whitespace-nowrap">
        {label}
        <span className={`text-[10px] transition-all ${active ? "text-primary opacity-100" : "opacity-25 group-hover:opacity-60"}`}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </TableHead>
  );
}
