import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/** Troca o token do email (recovery/magiclink) por sessão e segue para `next`.
 * Supabase manda `code` (PKCE, via redirect_to) ou `token_hash`+`type` (link direto). */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const next = url.searchParams.get("next") ?? "/redefinir";
  const sb = supabaseServer();

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = next;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (token_hash && type) {
    const { error } = await sb.auth.verifyOtp({ token_hash, type: type as never });
    if (!error) {
      url.pathname = next;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  url.pathname = "/login";
  url.searchParams.set("error", "Link inválido ou expirado. Peça um novo email.");
  return NextResponse.redirect(url);
}
