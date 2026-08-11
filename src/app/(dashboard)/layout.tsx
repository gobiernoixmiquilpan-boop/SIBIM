import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthProvider } from "@/components/auth-provider";
import { UIProvider } from "@/components/layout/ui-context";
import { CommandPalette } from "@/components/command-palette";
import { AlertBanner } from "@/components/alert-banner";
import { BackToTop } from "@/components/ui/back-to-top";
import { DataProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/toast";
import { getSession } from "@/lib/session";
import { dbGetProducts, dbGetCategories, dbGetMovements } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }

  const [products, categories, movements] = await Promise.all([
    dbGetProducts(),
    dbGetCategories(),
    dbGetMovements(),
  ]);

  return (
    <AuthProvider user={user}>
      <ToastProvider>
        <DataProvider
          initialProducts={products}
          initialCategories={categories}
          initialMovements={movements}
        >
          <UIProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 lg:ml-64 transition-all duration-300 overflow-y-auto">
                <AlertBanner />
                {children}
              </main>
            </div>
            <CommandPalette />
            <BackToTop />
          </UIProvider>
        </DataProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
