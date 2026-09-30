"use client";

import type { ReactNode } from "react";

/** Form GET que reenvia sozinho ao trocar qualquer filtro (select, checkbox, mês).
 *  Campo de texto: Enter aplica (sem submit a cada tecla). */
export function AutoForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && (active.type === "text" || active.type === "search")) return;
        e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
