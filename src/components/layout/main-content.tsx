"use client";

import { useUI } from "@/components/layout/ui-context";
import type { ReactNode } from "react";

export function MainContent({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useUI();
  return (
    <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"}`}>
      {children}
    </main>
  );
}
