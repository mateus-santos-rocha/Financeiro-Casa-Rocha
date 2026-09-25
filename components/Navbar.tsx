"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/movimentacoes", label: "Movimentações" },
  { href: "/analise", label: "Análise" },
  { href: "/historico", label: "Histórico" },
  { href: "/investimentos", label: "Investimentos" },
  { href: "/config", label: "Config" },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3">
        <Link href="/movimentacoes" className="mr-2 shrink-0 font-bold tracking-tight">
          🏠 Casa Rocha
        </Link>
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
