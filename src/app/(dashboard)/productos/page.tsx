"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  MagnifyingGlass, Plus, PencilSimple, Trash, Eye,
  Package, Upload, WarningCircle, DownloadSimple, X, SpinnerGap,
  SquaresFour, Rows, Copy, CheckSquare, Square,
} from "@phosphor-icons/react";
import { CategoryIcon } from "@/lib/icon-map";
import { ALL_AREA_NAMES } from "@/lib/areas-list";
import { isAreaAccessible, getAccessibleAreas } from "@/lib/access";
import { useAuth } from "@/components/auth-provider";
import { useData } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { Pagination } from "@/components/ui/pagination";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";
import { compressImage } from "@/lib/image";
import type { Product, ProductStatus } from "@/lib/types";
import type { AuthUser } from "@/lib/auth-users";

const UNIDADES = ["pieza", "unidad", "equipo", "juego", "lote", "kg", "litro"];

const STATUS_CONFIG: Record<ProductStatus, { label: string; className: string }> = {
  activo: { label: "Activo", className: "bg-teal-500/15 text-teal-500 border-0" },
  bajo_stock: { label: "Bajo Stock", className: "bg-amber-500/15 text-amber-500 border-0" },
  agotado: { label: "Agotado", className: "bg-rose-500/15 text-rose-500 border-0" },
  vencido: { label: "Vencido", className: "bg-purple-500/15 text-purple-500 border-0" },
};

function ProductosSkeleton() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      <div className="h-14 bg-muted border-b border-border" />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="h-9 flex-1 rounded-lg bg-muted" />
          <div className="h-9 w-24 rounded-lg bg-muted" />
          <div className="h-9 w-24 rounded-lg bg-muted" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={<ProductosSkeleton />}>
      <ProductosContent />
    </Suspense>
  );
}

function ProductosContent() {
  const user = useAuth();
  const { products, categories, deleteProduct, restoreProduct } = useData();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewFromUrl = searchParams.get("view");

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [filterCat, setFilterCat] = useState(searchParams.get("cat") ?? "todas");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "todos");
  const [filterArea, setFilterArea] = useState(searchParams.get("area") ?? "todas");
  const [openAdd, setOpenAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [viewTarget, setViewTarget] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [exportOpen, setExportOpen] = useState(false);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const exportMenuRef = useDismissableMenu<HTMLDivElement>(exportOpen, closeExport);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [duplicateSource, setDuplicateSource] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === paginated.length ? new Set() : new Set(paginated.map((p) => p.id))
    );
  }
  function clearSelection() { setSelected(new Set()); }

  function handleBatchDelete() {
    const ids = Array.from(selected);
    const saved = products.filter((p) => ids.includes(p.id));
    ids.forEach((id) => deleteProduct(id));
    clearSelection();
    toast(`${ids.length} bien${ids.length !== 1 ? "es" : ""} eliminado${ids.length !== 1 ? "s" : ""}`, "success",
      saved.length > 0 ? { label: "Deshacer", onClick: () => saved.forEach((p) => restoreProduct(p)) } : undefined
    );
  }

  function handleBatchExportCSV() {
    const selectedProducts = products.filter((p) => selected.has(p.id));
    const headers = ["Nombre", "Código", "Categoría", "Área", "Stock", "Mín.", "Valor", "Estado"];
    const rows = selectedProducts.map((p) => [
      p.nombre, p.codigo, p.categoria?.nombre ?? "", p.area ?? "",
      String(p.stock_actual), String(p.stock_minimo),
      `$${p.precio_venta.toFixed(2)}`, STATUS_CONFIG[p.estado].label,
    ]);
    downloadCSV(`seleccion_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast(`CSV con ${selectedProducts.length} bienes exportado`);
  }

  const openedViewRef = useRef<string | null>(null);

  // Sync active filters to URL so the page is bookmarkable and shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCat !== "todas") params.set("cat", filterCat);
    if (filterStatus !== "todos") params.set("status", filterStatus);
    if (filterArea !== "todas") params.set("area", filterArea);
    const qs = params.toString();
    router.replace(qs ? `/productos?${qs}` : "/productos", { scroll: false });
  }, [search, filterCat, filterStatus, filterArea, router]);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  }

  // Reset to page 1 when filters change — adjusted during render (not an effect) by
  // tracking the previous filter values, per React's "adjusting state" pattern.
  const [prevFilters, setPrevFilters] = useState({ search, filterCat, filterStatus, filterArea });
  if (prevFilters.search !== search || prevFilters.filterCat !== filterCat ||
      prevFilters.filterStatus !== filterStatus || prevFilters.filterArea !== filterArea) {
    setPrevFilters({ search, filterCat, filterStatus, filterArea });
    setPage(1);
  }

  // Auto-open view dialog when navigated from command palette (?view=id).
  // Genuine sync with an external system (the URL) — the ref guard makes it idempotent.
  useEffect(() => {
    if (!viewFromUrl || openedViewRef.current === viewFromUrl) return;
    const product = products.find((p) => p.id === viewFromUrl);
    if (product) {
      openedViewRef.current = viewFromUrl;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewTarget(product);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      const qs = params.toString();
      router.replace(qs ? `/productos?${qs}` : "/productos");
    }
  }, [viewFromUrl, products, router, searchParams]);

  const scopedProducts = useMemo(
    () => user.role === "admin" ? products : products.filter((p) => isAreaAccessible(user, p.area)),
    [user, products]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scopedProducts.filter((p) => {
      const matchSearch = !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (p.proveedor?.toLowerCase().includes(q)) ||
        (p.ubicacion?.toLowerCase().includes(q)) ||
        (p.descripcion?.toLowerCase().includes(q));
      const matchCat = filterCat === "todas" || p.categoria_id === filterCat;
      const matchStatus = filterStatus === "todos" || p.estado === filterStatus;
      const matchArea = filterArea === "todas" || p.area === filterArea;
      return matchSearch && matchCat && matchStatus && matchArea;
    });
  }, [scopedProducts, search, filterCat, filterStatus, filterArea]);

  // Clamp page within range during render (not an effect) — safe because the condition
  // becomes false on the immediate re-render React performs after a render-time setState.
  const maxPage = Math.max(1, Math.ceil(filtered.length / perPage));
  if (page > maxPage) {
    setPage(maxPage);
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);

  const hasFilters = search || filterCat !== "todas" || filterStatus !== "todos" || filterArea !== "todas";
  const areasConBienes = useMemo(
    () => Array.from(new Set(scopedProducts.map((p) => p.area).filter(Boolean))) as string[],
    [scopedProducts]
  );

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        let av: string | number = "", bv: string | number = "";
        if (sortField === "nombre")    { av = a.nombre; bv = b.nombre; }
        if (sortField === "codigo")    { av = a.codigo; bv = b.codigo; }
        if (sortField === "categoria") { av = a.categoria?.nombre ?? ""; bv = b.categoria?.nombre ?? ""; }
        if (sortField === "area")      { av = a.area ?? ""; bv = b.area ?? ""; }
        if (sortField === "stock")     { av = a.stock_actual; bv = b.stock_actual; }
        if (sortField === "valor")     { av = a.precio_venta; bv = b.precio_venta; }
        if (sortField === "estado")    { av = a.estado; bv = b.estado; }
        if (sortField === "garantia")  { av = a.fecha_vencimiento ?? ""; bv = b.fecha_vencimiento ?? ""; }
        const cmp = typeof av === "number" ? av - (bv as number) : (av as string).localeCompare(bv as string, "es");
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  function handleDelete() {
    if (!deleteId) return;
    const saved = products.find((p) => p.id === deleteId);
    deleteProduct(deleteId);
    setDeleteId(null);
    toast("Bien eliminado del inventario", "success", saved
      ? { label: "Deshacer", onClick: () => restoreProduct(saved) }
      : undefined);
  }

  function handleDuplicate(product: Product) {
    setDuplicateSource(product);
    setOpenAdd(true);
  }

  function handleExportCSV() {
    const headers = ["Nombre", "Código", "Categoría", "Área", "Stock", "Mín.", "Valor", "Estado", "Proveedor", "Ubicación"];
    const rows = filtered.map((p) => [
      p.nombre, p.codigo, p.categoria?.nombre ?? "", p.area ?? "",
      String(p.stock_actual), String(p.stock_minimo),
      `$${p.precio_venta.toFixed(2)}`, STATUS_CONFIG[p.estado].label,
      p.proveedor ?? "", p.ubicacion ?? "",
    ]);
    downloadCSV(`inventario_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast("CSV exportado correctamente");
  }

  function handleExportExcel() {
    const headers = ["Nombre", "Código", "Categoría", "Área", "Stock", "Mín.", "Valor Actual", "Estado", "Proveedor", "Ubicación"];
    const rows = filtered.map((p) => [
      p.nombre, p.codigo, p.categoria?.nombre ?? "", p.area ?? "",
      p.stock_actual, p.stock_minimo, p.precio_venta,
      STATUS_CONFIG[p.estado].label, p.proveedor ?? "", p.ubicacion ?? "",
    ]);
    downloadExcel(`inventario_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows);
    toast("Excel exportado correctamente");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar title="Productos" subtitle={`${filtered.length} bienes encontrados`} />

      <div className="p-6 space-y-4">

        {/* Toolbar */}
        <Card className="border-border" style={{ background: "var(--card)" }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o código..."
                  className="pl-10 pr-8 h-9 bg-muted/60 border-border text-foreground placeholder:text-muted-foreground"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* View toggle */}
              <div className="hidden sm:flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  aria-label="Vista tabla"
                  className={`h-9 w-9 flex items-center justify-center transition-colors ${viewMode === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Rows className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Vista cuadrícula"
                  className={`h-9 w-9 flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <SquaresFour className="w-4 h-4" />
                </button>
              </div>
              {/* Export buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-9 gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 hidden sm:flex"
              >
                <DownloadSimple className="w-4 h-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 hidden sm:flex"
              >
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
              <Dialog open={openAdd} onOpenChange={(o) => { if (!o) { setOpenAdd(false); setDuplicateSource(null); } }}>
                <DialogTrigger render={
                  <Button className="h-9 gap-2 shrink-0 text-primary-foreground" style={{ background: "var(--primary)" }} />
                }>
                  <Plus className="w-4 h-4" weight="bold" /> Agregar Bien
                </DialogTrigger>
                <DialogContent className="max-w-2xl border-border text-foreground" style={{ background: "var(--card)" }}>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{duplicateSource ? "Duplicar Bien" : "Nuevo Bien"}</DialogTitle>
                  </DialogHeader>
                  <ProductForm
                    user={user}
                    categories={categories}
                    product={duplicateSource ? {
                      ...duplicateSource,
                      id: "",
                      nombre: `${duplicateSource.nombre} (copia)`,
                      codigo: `${duplicateSource.codigo}-COPIA`,
                    } as Product : undefined}
                    onClose={() => { setOpenAdd(false); setDuplicateSource(null); }}
                    onSaved={() => { toast("Bien registrado en el inventario"); setDuplicateSource(null); }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterCat} onValueChange={(v) => setFilterCat(v ?? "todas")}
                items={{ todas: "Todas las categorías", ...Object.fromEntries(categories.map((c) => [c.id, c.nombre])) }}>
                <SelectTrigger className="h-8 text-xs bg-muted/60 border-border text-foreground w-44">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent className="border-border" style={{ background: "var(--card)" }}>
                  <SelectItem value="todas" className="text-foreground text-xs">Todas las categorías</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-foreground text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <CategoryIcon name={c.icono} className="w-3.5 h-3.5" /> {c.nombre}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "todos")}
                items={{ todos: "Todos los estados", activo: "Activo", bajo_stock: "Bajo Stock", agotado: "Agotado", vencido: "Vencido" }}>
                <SelectTrigger className="h-8 text-xs bg-muted/60 border-border text-foreground w-36">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent className="border-border" style={{ background: "var(--card)" }}>
                  <SelectItem value="todos" className="text-foreground text-xs">Todos los estados</SelectItem>
                  <SelectItem value="activo" className="text-foreground text-xs">Activo</SelectItem>
                  <SelectItem value="bajo_stock" className="text-foreground text-xs">Bajo Stock</SelectItem>
                  <SelectItem value="agotado" className="text-foreground text-xs">Agotado</SelectItem>
                  <SelectItem value="vencido" className="text-foreground text-xs">Vencido</SelectItem>
                </SelectContent>
              </Select>

              {user.role !== "direccion" && (
                <Select value={filterArea} onValueChange={(v) => setFilterArea(v ?? "todas")}
                  items={{ todas: "Todas las áreas", ...Object.fromEntries(areasConBienes.map((a) => [a, a])) }}>
                  <SelectTrigger className="h-8 text-xs bg-muted/60 border-border text-foreground w-52">
                    <SelectValue placeholder="Área asignada" />
                  </SelectTrigger>
                  <SelectContent className="border-border" style={{ background: "var(--card)" }}>
                    <SelectItem value="todas" className="text-foreground text-xs">Todas las áreas</SelectItem>
                    {areasConBienes.map((a) => (
                      <SelectItem key={a} value={a} className="text-foreground text-xs">{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setFilterCat("todas"); setFilterStatus("todos"); setFilterArea("todas"); }}
                  className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  × Limpiar filtros
                </button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Batch action bar */}
        {selected.size > 0 && (
          <div className="animate-in slide-in-from-bottom-2 fade-in duration-200 flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 shadow-lg"
            style={{ background: "color-mix(in oklch, var(--primary) 8%, var(--card))" }}>
            <span className="text-sm font-semibold text-foreground">
              {selected.size} bien{selected.size !== 1 ? "es" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleBatchExportCSV}
                className="h-8 gap-1.5 text-xs border-border text-muted-foreground hover:text-foreground">
                <DownloadSimple className="w-3.5 h-3.5" /> Exportar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchDelete}
                className="h-8 gap-1.5 text-xs border-rose-500/30 text-rose-500 hover:bg-rose-500/10">
                <Trash className="w-3.5 h-3.5" /> Eliminar ({selected.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Grid view */}
        {viewMode === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginated.map((product, i) => (
              <div key={product.id}
                className="rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 animate-in fade-in cursor-pointer group"
                style={{ background: "var(--card)", animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}
                onClick={() => setViewTarget(product)}>
                <div className="h-32 flex items-center justify-center"
                  style={{ background: product.foto_url ? "transparent" : "var(--muted)" }}>
                  {product.foto_url
                    ? <img src={product.foto_url} alt={product.nombre} className="w-full h-full object-cover" />
                    : <CategoryIcon name={product.categoria?.icono} className="w-10 h-10 text-muted-foreground/40" />}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-foreground leading-tight line-clamp-2">{product.nombre}</p>
                    <Badge className={`text-[10px] flex-shrink-0 ${STATUS_CONFIG[product.estado].className}`}>
                      {STATUS_CONFIG[product.estado].label}
                    </Badge>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground mb-2">{product.codigo}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold ${product.estado === "agotado" ? "text-rose-500" : product.estado === "bajo_stock" ? "text-amber-500" : "text-foreground"}`}>
                      {product.stock_actual} {product.unidad}
                    </span>
                    <span className="text-muted-foreground">${product.precio_venta.toLocaleString("es-MX", { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent flex-1" aria-label={`Editar ${product.nombre}`}
                      onClick={() => setEditTarget(product)}>
                      <PencilSimple className="w-3.5 h-3.5" weight="duotone" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent flex-1" aria-label={`Duplicar ${product.nombre}`}
                      onClick={() => handleDuplicate(product)}>
                      <Copy className="w-3.5 h-3.5" weight="duotone" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-rose-500/10 hover:text-rose-500 flex-1" aria-label={`Eliminar ${product.nombre}`}
                      onClick={() => setDeleteId(product.id)}>
                      <Trash className="w-3.5 h-3.5" weight="duotone" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16 flex flex-col items-center gap-3">
                <Package className="w-12 h-12 text-muted-foreground/40" weight="duotone" />
                {scopedProducts.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Aún no hay bienes registrados</p>
                    <p className="text-xs text-muted-foreground">Agrega el primer bien patrimonial para comenzar el inventario</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">No se encontraron bienes</p>
                    {hasFilters && <button type="button" onClick={() => { setSearch(""); setFilterCat("todas"); setFilterStatus("todos"); setFilterArea("todas"); }} className="text-xs text-primary hover:underline font-medium">Limpiar filtros</button>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {viewMode === "table" && (
        <Card className="border-border hover:shadow-md transition-shadow" style={{ background: "var(--card)" }}>
          <CardContent className="p-0">
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {paginated.map((product) => (
                <div key={product.id} className="p-4 flex items-start gap-3 hover:bg-accent/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--muted)" }}>
                    {product.foto_url
                      ? <img src={product.foto_url} alt={product.nombre} className="w-full h-full object-cover rounded-xl" />
                      : <CategoryIcon name={product.categoria?.icono} className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-foreground truncate">{product.nombre}</p>
                      <Badge className={`text-xs flex-shrink-0 ${STATUS_CONFIG[product.estado].className}`}>
                        {STATUS_CONFIG[product.estado].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.codigo}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CategoryIcon name={product.categoria?.icono} className="w-3 h-3" />
                        {product.categoria?.nombre}
                      </span>
                      {product.area && <span className="truncate">· {product.area.split(" ")[0]}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`font-bold ${
                          product.estado === "agotado" ? "text-rose-500" :
                          product.estado === "bajo_stock" ? "text-amber-500" : "text-foreground"
                        }`}>{product.stock_actual} {product.unidad}</span>
                        <span className="text-muted-foreground">${product.precio_venta.toLocaleString("es-MX", { minimumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent text-muted-foreground hover:text-foreground"
                          aria-label={`Ver ${product.nombre}`}
                          onClick={() => setViewTarget(product)}>
                          <Eye className="w-3.5 h-3.5" weight="duotone" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent text-muted-foreground hover:text-primary"
                          aria-label={`Duplicar ${product.nombre}`}
                          onClick={() => handleDuplicate(product)}>
                          <Copy className="w-3.5 h-3.5" weight="duotone" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent text-muted-foreground hover:text-primary"
                          aria-label={`Editar ${product.nombre}`}
                          onClick={() => setEditTarget(product)}>
                          <PencilSimple className="w-3.5 h-3.5" weight="duotone" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                          aria-label={`Eliminar ${product.nombre}`}
                          onClick={() => setDeleteId(product.id)}>
                          <Trash className="w-3.5 h-3.5" weight="duotone" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 pl-4">
                      <button type="button" onClick={toggleSelectAll} aria-label="Seleccionar todos"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        {selected.size > 0 && selected.size === paginated.length
                          ? <CheckSquare className="w-4 h-4 text-primary" weight="fill" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </TableHead>
                    <SortTh label="Bien" field="nombre" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Código" field="codigo" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Categoría" field="categoria" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Área" field="area" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Existencias" field="stock" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortTh label="Valor Actual" field="valor" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortTh label="Garantía" field="garantia" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Estado" field="estado" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <TableHead className="text-muted-foreground font-medium text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((product, i) => (
                    <TableRow key={product.id}
                      onClick={() => setViewTarget(product)}
                      className="border-border hover:bg-accent/60 transition-colors animate-in fade-in cursor-pointer"
                      style={{
                        animationDelay: `${Math.min(i, 12) * 30}ms`,
                        animationFillMode: "backwards",
                        background: i % 2 === 1 ? "color-mix(in oklch, var(--muted) 35%, transparent)" : undefined,
                      }}>
                      <TableCell className="w-10 pl-4" onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}>
                        {selected.has(product.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" weight="fill" />
                          : <Square className="w-4 h-4 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--muted)" }}>
                            {product.foto_url
                              ? <img src={product.foto_url} alt={product.nombre} className="w-full h-full object-cover rounded-xl" />
                              : <CategoryIcon name={product.categoria?.icono} className="w-5 h-5 text-muted-foreground" />}
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{product.nombre}</p>
                            <p className="text-xs text-muted-foreground">{product.ubicacion || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{product.codigo}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CategoryIcon name={product.categoria?.icono} className="w-3.5 h-3.5" />
                          {product.categoria?.nombre.split(" ")[0]}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{product.area ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div>
                          <span className={`font-bold text-sm ${
                            product.estado === "agotado" ? "text-rose-500" :
                            product.estado === "bajo_stock" ? "text-amber-500" : "text-foreground"
                          }`}>{product.stock_actual}</span>
                          <span className="text-xs text-muted-foreground ml-1">{product.unidad}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">mín. {product.stock_minimo}</div>
                      </TableCell>
                      <TableCell className="text-right text-foreground font-medium">
                        ${product.precio_venta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {product.fecha_vencimiento ? (() => {
                          const dias = Math.ceil((new Date(product.fecha_vencimiento).getTime() - Date.now()) / 86400000);
                          const badge =
                            dias < 0  ? { label: "Vencido",    cls: "bg-rose-500/15 text-rose-500" } :
                            dias === 0 ? { label: "Hoy",        cls: "bg-orange-500/15 text-orange-500" } :
                            dias <= 3  ? { label: `${dias}d`,   cls: "bg-amber-500/15 text-amber-500" } :
                            dias <= 7  ? { label: `${dias}d`,   cls: "bg-purple-500/15 text-purple-500" } :
                            null;
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className={dias < 0 ? "text-rose-400" : "text-muted-foreground"}>
                                {new Date(product.fecha_vencimiento).toLocaleDateString("es-MX")}
                              </span>
                              {badge && (
                                <span className={`inline-flex w-fit px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                          );
                        })() : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_CONFIG[product.estado].className}`}>
                          {STATUS_CONFIG[product.estado].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-foreground"
                            aria-label={`Ver ${product.nombre}`}
                            onClick={() => setViewTarget(product)}>
                            <Eye className="w-3.5 h-3.5" weight="duotone" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-primary"
                            aria-label={`Duplicar ${product.nombre}`}
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(product); }}>
                            <Copy className="w-3.5 h-3.5" weight="duotone" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-primary"
                            aria-label={`Editar ${product.nombre}`}
                            onClick={() => setEditTarget(product)}>
                            <PencilSimple className="w-3.5 h-3.5" weight="duotone" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                            aria-label={`Eliminar ${product.nombre}`}
                            onClick={() => setDeleteId(product.id)}>
                            <Trash className="w-3.5 h-3.5" weight="duotone" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 flex flex-col items-center gap-3">
                <Package className="w-12 h-12 text-muted-foreground/40" weight="duotone" />
                {scopedProducts.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Aún no hay bienes registrados</p>
                    <p className="text-xs text-muted-foreground">Agrega el primer bien patrimonial para comenzar el inventario</p>
                    {user.role === "admin" && (
                      <button
                        type="button"
                        onClick={() => setOpenAdd(true)}
                        className="inline-flex items-center gap-1.5 mt-1 h-8 px-4 rounded-lg text-xs font-semibold text-primary-foreground transition-all active:scale-95"
                        style={{ background: "var(--primary)" }}
                      >
                        <Plus className="w-3.5 h-3.5" weight="bold" /> Agregar primer bien
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">No se encontraron bienes</p>
                    <p className="text-xs text-muted-foreground">Ajusta los filtros o agrega un nuevo bien</p>
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={() => { setSearch(""); setFilterCat("todas"); setFilterStatus("todos"); setFilterArea("todas"); }}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </>
                )}
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
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null) }}>
        <DialogContent className="max-w-2xl border-border text-foreground" style={{ background: "var(--card)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Bien</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <ProductForm
              user={user}
              categories={categories}
              product={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={() => toast("Bien actualizado correctamente")}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null) }}>
        <DialogContent className="max-w-lg border-border text-foreground" style={{ background: "var(--card)" }}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-foreground">Detalle del Bien</DialogTitle>
              <button onClick={() => setViewTarget(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          {viewTarget && <ProductDetail product={viewTarget} />}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Eliminar bien"
        description="Esta acción eliminará el bien del inventario. Los movimientos históricos se conservarán."
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
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

// ─── Product Detail (view-only) ──────────────────────────────────────────────

const TIPO_DOT: Record<string, string> = {
  entrada: "#14B8A6", salida: "#F43F5E", ajuste: "#F59E0B", transferencia: "#818CF8",
};
const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", transferencia: "Transferencia",
};

function ProductDetail({ product }: { product: Product }) {
  const { movements } = useData();
  const history = movements.filter((m) => m.producto_id === product.id).slice(0, 8);
  const cfg = STATUS_CONFIG[product.estado];

  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground font-medium text-right max-w-56 truncate">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/40">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--muted)" }}>
          {product.foto_url
            ? <img src={product.foto_url} alt={product.nombre} className="w-full h-full object-cover rounded-xl" />
            : <CategoryIcon name={product.categoria?.icono} className="w-7 h-7 text-muted-foreground" />}
        </div>
        <div>
          <p className="font-semibold text-foreground">{product.nombre}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.codigo}</p>
          <Badge className={`text-xs mt-1 ${cfg.className}`}>{cfg.label}</Badge>
        </div>
      </div>
      <div className="divide-y-0">
        {row("Categoría", product.categoria?.nombre ?? "—")}
        {row("Área asignada", product.area ?? "—")}
        {row("Unidad", product.unidad)}
        {row("Stock actual", `${product.stock_actual} (mín. ${product.stock_minimo} / máx. ${product.stock_maximo})`)}
        {row("Costo de adquisición", `$${product.precio_compra.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)}
        {row("Valor actual", `$${product.precio_venta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)}
        {row("Proveedor", product.proveedor ?? "—")}
        {row("Ubicación", product.ubicacion ?? "—")}
        {row("Vencimiento garantía", product.fecha_vencimiento ? new Date(product.fecha_vencimiento).toLocaleDateString("es-MX") : "—")}
        {product.descripcion && row("Descripción", product.descripcion)}
        {row("Registrado", new Date(product.created_at).toLocaleDateString("es-MX"))}
        {row("Última actualización", new Date(product.updated_at).toLocaleDateString("es-MX"))}
      </div>

      {history.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Historial de movimientos</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {history.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-accent/40 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TIPO_DOT[m.tipo] }} />
                <span className="text-xs text-muted-foreground w-20 shrink-0">{TIPO_LABEL[m.tipo]}</span>
                <span className="text-xs font-semibold" style={{ color: TIPO_DOT[m.tipo] }}>
                  {m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "−" : "±"}{m.cantidad}
                </span>
                <span className="text-xs text-muted-foreground font-mono ml-1">
                  {m.stock_anterior} → {m.stock_nuevo}
                </span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                  {new Date(m.created_at).toLocaleDateString("es-MX")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Product Form ─────────────────────────────────────────────────────────────

type FormData = {
  nombre: string; codigo: string; categoria_id: string; unidad: string;
  area: string; precio_compra: string; precio_venta: string;
  stock_actual: string; stock_minimo: string; stock_maximo: string;
  fecha_vencimiento: string; proveedor: string; ubicacion: string;
  descripcion: string; foto_url: string;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] text-destructive mt-1">
      <WarningCircle className="w-3 h-3 flex-shrink-0" weight="fill" /> {msg}
    </p>
  );
}

function ProductForm({
  onClose, onSaved, user, categories, product,
}: {
  onClose: () => void;
  onSaved: () => void;
  user: AuthUser;
  categories: import("@/lib/types").Category[];
  product?: Product;
}) {
  const { addProduct, updateProduct, products: allProducts } = useData();
  const { toast } = useToast();
  const scopedProducts = useMemo(
    () => (user.role === "admin" ? allProducts : allProducts.filter((p) => isAreaAccessible(user, p.area))),
    [allProducts, user]
  );
  const areaOptions = useMemo(
    () => (user.role === "admin" ? ALL_AREA_NAMES : Array.from(getAccessibleAreas(user) ?? [])),
    [user]
  );
  const [submitted, setSubmitted] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(product?.foto_url ?? "");
  const [imageLoading, setImageLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    nombre: product?.nombre ?? "",
    codigo: product?.codigo ?? "",
    categoria_id: product?.categoria_id ?? "",
    unidad: product?.unidad ?? "pieza",
    area: product?.area ?? (user.role !== "admin" ? user.area ?? "" : ""),
    precio_compra: product?.precio_compra ? String(product.precio_compra) : "",
    precio_venta: product?.precio_venta ? String(product.precio_venta) : "",
    stock_actual: product ? String(product.stock_actual) : "0",
    stock_minimo: product ? String(product.stock_minimo) : "0",
    stock_maximo: product ? String(product.stock_maximo) : "0",
    fecha_vencimiento: product?.fecha_vencimiento ?? "",
    proveedor: product?.proveedor ?? "",
    ubicacion: product?.ubicacion ?? "",
    descripcion: product?.descripcion ?? "",
    foto_url: product?.foto_url ?? "",
  });

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const stockMin = parseInt(form.stock_minimo) || 0;
  const stockMax = parseInt(form.stock_maximo) || 0;

  const errors = {
    nombre: !form.nombre.trim() ? "El nombre del bien es requerido" : undefined,
    codigo: !form.codigo.trim()
      ? "El código es requerido"
      : scopedProducts.some((p) => p.codigo.toUpperCase() === form.codigo.trim().toUpperCase() && p.id !== product?.id)
        ? "Este código ya está en uso"
        : undefined,
    categoria_id: !form.categoria_id ? "Selecciona una categoría" : undefined,
    stock_minimo: stockMax > 0 && stockMin > stockMax ? "El mínimo no puede superar el máximo" : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("La imagen no puede superar 8 MB.", "error");
      e.target.value = "";
      return;
    }
    setImageLoading(true);
    try {
      const url = await compressImage(file, 800, 0.8);
      setPhotoPreview(url);
      set("foto_url", url);
    } catch {
      toast("No se pudo procesar la imagen. Intenta con otro archivo.", "error");
    } finally {
      setImageLoading(false);
      e.target.value = "";
    }
  }

  function handleSubmit() {
    setSubmitted(true);
    if (hasErrors) return;

    const cat = categories.find((c) => c.id === form.categoria_id);
    const stockActual = parseInt(form.stock_actual) || 0;
    const stockMin = parseInt(form.stock_minimo) || 0;
    const estado: import("@/lib/types").ProductStatus =
      stockActual === 0 ? "agotado" : stockActual <= stockMin ? "bajo_stock" : "activo";

    const data = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      categoria_id: form.categoria_id,
      categoria: cat,
      unidad: form.unidad || "pieza",
      area: form.area || undefined,
      precio_compra: parseFloat(form.precio_compra) || 0,
      precio_venta: parseFloat(form.precio_venta) || 0,
      stock_actual: stockActual,
      stock_minimo: stockMin,
      stock_maximo: parseInt(form.stock_maximo) || 0,
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      proveedor: form.proveedor || undefined,
      ubicacion: form.ubicacion || undefined,
      descripcion: form.descripcion || undefined,
      foto_url: form.foto_url || undefined,
      estado,
    };

    if (product) {
      updateProduct(product.id, data);
    } else {
      addProduct(data);
    }
    onSaved();
    onClose();
  }

  const errClass = (field: keyof typeof errors) =>
    submitted && errors[field] ? "border-destructive focus-visible:ring-destructive/20" : "";

  return (
    <form className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      {/* Foto */}
      <label className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-primary/40 transition-colors cursor-pointer flex flex-col items-center gap-2 relative">
        {imageLoading
          ? <>
              <SpinnerGap className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Procesando imagen...</p>
            </>
          : photoPreview
          ? <img src={photoPreview} alt="" className="h-20 object-contain rounded-lg" />
          : <>
              <Upload className="w-7 h-7 text-muted-foreground" weight="duotone" />
              <p className="text-sm text-muted-foreground">Arrastra una foto o haz clic para subir</p>
              <p className="text-xs text-muted-foreground">PNG, JPG hasta 8MB — se optimiza automáticamente</p>
            </>
        }
        <input type="file" accept="image/*" className="sr-only" onChange={handlePhoto} disabled={imageLoading} />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Nombre del Bien <span className="text-destructive">*</span></Label>
          <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)}
            className={`bg-muted border-border text-foreground placeholder:text-muted-foreground ${errClass("nombre")}`}
            placeholder="Ej. Escritorio ejecutivo" />
          <FieldError msg={submitted ? errors.nombre : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Código <span className="text-destructive">*</span></Label>
          <Input value={form.codigo} onChange={(e) => set("codigo", e.target.value)}
            className={`bg-muted border-border text-foreground placeholder:text-muted-foreground ${errClass("codigo")}`}
            placeholder="Ej. MB-001" />
          <FieldError msg={submitted ? errors.codigo : undefined} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Categoría <span className="text-destructive">*</span></Label>
          <Select value={form.categoria_id} onValueChange={(v) => set("categoria_id", v ?? "")}
            items={Object.fromEntries(categories.map((c) => [c.id, c.nombre]))}>
            <SelectTrigger className={`bg-muted border-border text-foreground ${errClass("categoria_id")}`}>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent className="border-border" style={{ background: "var(--card)" }}>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-foreground">
                  <span className="inline-flex items-center gap-1.5"><CategoryIcon name={c.icono} className="w-3.5 h-3.5" /> {c.nombre}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError msg={submitted ? errors.categoria_id : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Unidad de Medida</Label>
          <Select value={form.unidad} onValueChange={(v) => set("unidad", v ?? "pieza")}
            items={Object.fromEntries(UNIDADES.map((u) => [u, u]))}>
            <SelectTrigger className="bg-muted border-border text-foreground">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent className="border-border" style={{ background: "var(--card)" }}>
              {UNIDADES.map((u) => (
                <SelectItem key={u} value={u} className="text-foreground">{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Área asignada</Label>
        {user.role === "direccion" ? (
          <Input value={user.area ?? ""} disabled className="bg-muted border-border text-foreground disabled:opacity-100" />
        ) : (
          <Select value={form.area} onValueChange={(v) => set("area", v ?? "")}
            items={Object.fromEntries(areaOptions.map((a) => [a, a]))}>
            <SelectTrigger className="bg-muted border-border text-foreground">
              <SelectValue placeholder="Secretaría o dirección responsable" />
            </SelectTrigger>
            <SelectContent className="border-border max-h-64" style={{ background: "var(--card)" }}>
              {areaOptions.map((a) => (
                <SelectItem key={a} value={a} className="text-foreground text-sm">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Costo de Adquisición</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input type="number" min="0" value={form.precio_compra} onChange={(e) => set("precio_compra", e.target.value)}
              className="bg-muted border-border text-foreground pl-6" placeholder="0.00" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Valor Actual</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input type="number" min="0" value={form.precio_venta} onChange={(e) => set("precio_venta", e.target.value)}
              className="bg-muted border-border text-foreground pl-6" placeholder="0.00" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Existencias</Label>
          <Input type="number" min="0" value={form.stock_actual} onChange={(e) => set("stock_actual", e.target.value)}
            className="bg-muted border-border text-foreground" placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs flex items-center gap-1">
            Stock Mínimo
            <HelpTooltip text="El sistema generará una alerta cuando las existencias bajen de este número." />
          </Label>
          <Input type="number" min="0" value={form.stock_minimo} onChange={(e) => set("stock_minimo", e.target.value)}
            className={`bg-muted border-border text-foreground ${errClass("stock_minimo")}`} placeholder="0" />
          <FieldError msg={submitted ? errors.stock_minimo : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs flex items-center gap-1">
            Stock Máximo
            <HelpTooltip text="Tope de inventario esperado. Se usa para calcular el porcentaje de ocupación en reportes." />
          </Label>
          <Input type="number" min="0" value={form.stock_maximo} onChange={(e) => set("stock_maximo", e.target.value)}
            className="bg-muted border-border text-foreground" placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs flex items-center gap-1">
            Vencimiento de Garantía
            <HelpTooltip text="Opcional. Si se establece, el sistema alertará 30 días antes del vencimiento." />
          </Label>
          <DateInput value={form.fecha_vencimiento} onChange={(e) => set("fecha_vencimiento", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Proveedor</Label>
          <Input value={form.proveedor} onChange={(e) => set("proveedor", e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground" placeholder="Nombre del proveedor" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Ubicación física</Label>
          <Input value={form.ubicacion} onChange={(e) => set("ubicacion", e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground" placeholder="Ej. Palacio Municipal, Piso 2" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Descripción</Label>
        <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)}
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none" rows={2}
          placeholder="Descripción del bien..." />
      </div>

      {submitted && hasErrors && (
        <p className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          <WarningCircle className="w-3.5 h-3.5 flex-shrink-0" weight="fill" />
          Completa los campos obligatorios antes de guardar
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-border text-muted-foreground hover:bg-accent hover:text-foreground">
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 text-primary-foreground" style={{ background: "var(--primary)" }}>
          {product ? "Guardar Cambios" : "Guardar Bien"}
        </Button>
      </div>
    </form>
  );
}
