import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/movimentacoes", "/transacional", "/analise", "/historico", "/investimentos"];

// Renova a sessão Supabase a cada request (evita refresh dentro do render,
// que o Next proíbe) e barra anônimo nas páginas protegidas.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await sb.auth.getUser();
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/movimentacoes/:path*", "/transacional/:path*", "/analise/:path*", "/historico/:path*", "/investimentos/:path*"],
};
