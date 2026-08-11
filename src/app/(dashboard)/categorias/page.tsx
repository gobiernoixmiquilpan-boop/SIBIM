"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, PencilSimple, Trash, Package, WarningCircle, MagnifyingGlass, X } from "@phosphor-icons/react";
import { CATEGORY_ICON_NAMES, resolveCategoryIcon, CategoryIcon } from "@/lib/icon-map";
import { useAuth } from "@/components/auth-provider";
import { isAreaAccessible } from "@/lib/access";
import { useData } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import type { Category } from "@/lib/types";

const COLORS = ["#7C3AED", "#10B981", "#EF4444", "#F59E0B", "#3B82F6", "#F97316", "#EC4899", "#06B6D4", "#8B5CF6", "#14B8A6"];

export default function CategoriasPage() {
  const user = useAuth();
  const { products, categories, deleteCategory } = useData();
  const { toast } = useToast();

  const [openAdd, setOpenAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const scopedProducts = user.role === "admin"
    ? products
    : products.filter((p) => isAreaAccessible(user, p.area));

  const categoriasFiltradas = (user.role === "admin"
    ? categories
    : categories.filter((c) => scopedProducts.some((p) => p.categoria_id === c.id))
  ).filter((c) => !search || c.nombre.toLowerCase().includes(search.toLowerCase()));

  const categoriasConBienes = categoriasFiltradas;

  const maxProductos = Math.max(...categoriasConBienes.map((c) =>
    scopedProducts.filter((p) => p.categoria_id === c.id).length
  ), 1);

  function handleDelete() {
    if (!deleteId) return;
    const hasProducts = products.some((p) => p.categoria_id === deleteId);
    if (hasProducts) {
      toast("No se puede eliminar: hay bienes asignados a esta categoría", "error");
      setDeleteId(null);
      return;
    }
    deleteCategory(deleteId);
    setDeleteId(null);
    toast("Categoría eliminada correctamente");
  }

  const deleteTarget = categories.find((c) => c.id === deleteId);

  return (
    <div className="min-h-screen bg-background">
      <Topbar title="Categorías" subtitle="Tipos de bienes patrimoniales" />

      <div className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría..."
              className="pl-10 pr-8 h-9 bg-muted/60 border-border text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {categoriasConBienes.length}{" "}
                <span className="text-muted-foreground font-normal">
                  {search ? "encontradas" : "categorías activas"}
                </span>
              </p>
              {user.role !== "admin" && (
                <p className="text-xs text-muted-foreground mt-0.5">Mostrando solo las de tu área</p>
              )}
            </div>
          </div>
          {user.role === "admin" && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger render={
                <Button className="h-9 gap-2 text-primary-foreground" style={{ background: "var(--primary)" }} />
              }>
                <Plus className="w-4 h-4" /> Nueva Categoría
              </DialogTrigger>
              <DialogContent className="max-w-md border-border text-foreground bg-card">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Nueva Categoría</DialogTitle>
                </DialogHeader>
                <CategoriaForm
                  onClose={() => setOpenAdd(false)}
                  onSaved={() => toast("Categoría creada correctamente")}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Empty state when search yields no results */}
        {categoriasConBienes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-muted">
              <MagnifyingGlass className="w-7 h-7 text-muted-foreground/50" weight="duotone" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {search ? `Sin resultados para "${search}"` : "No hay categorías disponibles"}
            </p>
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="text-xs text-primary hover:underline font-medium">
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}

        {/* Category cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categoriasConBienes.map((cat, i) => {
            const productos = scopedProducts.filter((p) => p.categoria_id === cat.id);
            const activos = productos.filter((p) => p.estado === "activo").length;
            const alertas = productos.filter((p) => p.estado === "bajo_stock" || p.estado === "agotado").length;
            const valor = productos.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0);
            const pctProductos = Math.round((productos.length / maxProductos) * 100);

            return (
              <Card key={cat.id}
                className="border-border hover:border-primary/20 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group overflow-hidden animate-in fade-in slide-in-from-bottom-1"
                style={{
                  animationDelay: `${i * 40}ms`,
                  animationFillMode: "backwards",
                  background: `linear-gradient(135deg, var(--card) 50%, ${cat.color}10)`,
                }}>
                <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${cat.color}, transparent)` }} />

                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 shadow-sm"
                        style={{ background: `${cat.color}20`, color: cat.color }}>
                        <CategoryIcon name={cat.icono} className="w-5.5 h-5.5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm text-foreground leading-tight">{cat.nombre}</CardTitle>
                        <p className="text-xs mt-0.5 text-muted-foreground truncate max-w-32">{cat.descripcion}</p>
                      </div>
                    </div>
                    {user.role === "admin" && (
                      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent text-muted-foreground hover:text-primary"
                          aria-label={`Editar ${cat.nombre}`}
                          onClick={() => setEditTarget(cat)}>
                          <PencilSimple className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                          aria-label={`Eliminar ${cat.nombre}`}
                          onClick={() => setDeleteId(cat.id)}>
                          <Trash className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg py-2 px-1" style={{ background: `${cat.color}10` }}>
                      <p className="text-lg font-bold" style={{ color: cat.color }}>{productos.length}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className="rounded-lg py-2 px-1 bg-teal-500/10">
                      <p className="text-lg font-bold text-teal-500">{activos}</p>
                      <p className="text-[10px] text-muted-foreground">Activos</p>
                    </div>
                    <div className={`rounded-lg py-2 px-1 ${alertas > 0 ? "bg-amber-500/10" : "bg-muted/60"}`}>
                      <p className={`text-lg font-bold ${alertas > 0 ? "text-amber-500" : "text-muted-foreground/40"}`}>{alertas}</p>
                      <p className="text-[10px] text-muted-foreground">Alertas</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Package className="w-3 h-3" /> Bienes
                      </span>
                      <span className="text-[10px] font-medium text-foreground">{pctProductos}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctProductos}%`, background: cat.color }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                      <span className="text-xs text-muted-foreground">Valor patrimonial</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        ${valor.toLocaleString("es-MX", { minimumFractionDigits: 0 })}
                      </span>
                      {alertas > 0 && (
                        <Badge className="text-[10px] px-1.5 bg-amber-500/15 text-amber-500 border-0">
                          {alertas} alerta{alertas > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null) }}>
        <DialogContent className="max-w-md border-border text-foreground bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Categoría</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <CategoriaForm
              category={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={() => toast("Categoría actualizada correctamente")}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Eliminar categoría"
        description={`¿Eliminar "${deleteTarget?.nombre}"? Solo se puede eliminar si no tiene bienes asignados.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ─── Categoría Form ───────────────────────────────────────────────────────────

function CategoriaForm({
  onClose, onSaved, category,
}: {
  onClose: () => void;
  onSaved: () => void;
  category?: Category;
}) {
  const { addCategory, updateCategory, categories: allCategories } = useData();
  const [nombre, setNombre] = useState(category?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(category?.descripcion ?? "");
  const [selectedIcon, setSelectedIcon] = useState(category?.icono ?? "Armchair");
  const [selectedColor, setSelectedColor] = useState(category?.color ?? "#7C3AED");
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    nombre: !nombre.trim()
      ? "El nombre es requerido"
      : allCategories.some((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase() && c.id !== category?.id)
        ? "Ya existe una categoría con este nombre"
        : undefined,
  };

  function handleSubmit() {
    setSubmitted(true);
    if (errors.nombre) return;

    if (category) {
      updateCategory(category.id, { nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, icono: selectedIcon, color: selectedColor });
    } else {
      addCategory({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, icono: selectedIcon, color: selectedColor });
    }
    onSaved();
    onClose();
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Nombre *</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)}
          className={`bg-muted border-border text-foreground placeholder:text-muted-foreground ${submitted && errors.nombre ? "border-destructive" : ""}`}
          placeholder="Ej. Mobiliario" />
        {submitted && errors.nombre && (
          <p className="flex items-center gap-1 text-[11px] text-destructive mt-1">
            <WarningCircle className="w-3 h-3" weight="fill" /> {errors.nombre}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Descripción</Label>
        <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none" rows={2}
          placeholder="Descripción de la categoría..." />
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${selectedColor}20`, color: selectedColor }}>
          <CategoryIcon name={selectedIcon} className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">{nombre || "Nombre de la categoría"}</p>
          <p className="text-[10px] text-muted-foreground">Vista previa</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Ícono</Label>
        <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
          {CATEGORY_ICON_NAMES.map((name) => {
            const Icon = resolveCategoryIcon(name);
            return (
              <button key={name} type="button" onClick={() => setSelectedIcon(name)} aria-label={name}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={selectedIcon === name
                  ? { background: `${selectedColor}25`, color: selectedColor, boxShadow: `0 0 0 2px ${selectedColor}` }
                  : { background: "var(--muted)", color: "var(--muted-foreground)" }
                }>
                <Icon className="w-4.5 h-4.5" weight="duotone" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Color</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setSelectedColor(c)}
              className="w-7 h-7 rounded-full transition-all hover:scale-110"
              style={{
                background: c,
                boxShadow: selectedColor === c ? `0 0 0 2px var(--background), 0 0 0 4px ${c}` : undefined,
                transform: selectedColor === c ? "scale(1.1)" : undefined,
              }} />
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-border text-muted-foreground hover:bg-accent">
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 text-primary-foreground" style={{ background: "var(--primary)" }}>
          {category ? "Guardar Cambios" : "Crear Categoría"}
        </Button>
      </div>
    </form>
  );
}
