import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/** Troca o token do email (recovery/magiclink) por sessão e segue para `next`. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/redefinir";
  if (token_hash && type) {
    const sb = supabaseServer();
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
