import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/movimentacoes", "/transacional", "/analise", "/historico", "/investimentos", "/config"];

// Guarda simples: se não houver sessão Supabase nos cookies, manda para /login.
// A verificação autoritativa continua no server via Supabase + RLS.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/movimentacoes/:path*", "/transacional/:path*", "/analise/:path*", "/historico/:path*", "/investimentos/:path*", "/config/:path*"],
};
