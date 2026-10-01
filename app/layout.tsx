import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { SyncBadge } from "@/components/SyncBadge";

export const metadata: Metadata = {
  title: "Financeiro Casa Rocha",
  description: "Finanças da casa — movimentações, análise, histórico e investimentos.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Navbar />
        <SyncBadge />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
