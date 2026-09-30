"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "./supabase-server";

async function ensureTag(sb: ReturnType<typeof supabaseServer>, name: string) {
  const clean = name.trim().toLowerCase().slice(0, 60);
  if (!clean) throw new Error("Nome de tag vazio");
  const { data: found } = await sb.from("tags").select("id").eq("name", clean).maybeSingle();
  if (found) return found.id as string;
  const { data: created, error } = await sb
    .from("tags")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

export async function setOverride(id: string, category: string) {
  const sb = supabaseServer();
  const value = category.trim() || null;
  const { error } = await sb.from("transactions").update({ category_override: value }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/movimentacoes");
}

export async function addTagToTx(id: string, name: string) {
  const sb = supabaseServer();
  const tagId = await ensureTag(sb, name);
  const { error } = await sb
    .from("transaction_tags")
    .upsert({ transaction_id: id, tag_id: tagId }, { onConflict: "transaction_id,tag_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/movimentacoes");
}

export async function removeTagFromTx(id: string, tagId: string) {
  const sb = supabaseServer();
  const { error } = await sb
    .from("transaction_tags")
    .delete()
    .eq("transaction_id", id)
    .eq("tag_id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath("/movimentacoes");
}

export async function applyTagBatch(ids: string[], name: string) {
  if (ids.length === 0) throw new Error("Nenhum lançamento selecionado");
  if (ids.length > 500) throw new Error("Selecione no máximo 500 por vez");
  const sb = supabaseServer();
  const tagId = await ensureTag(sb, name);
  const { error } = await sb
    .from("transaction_tags")
    .upsert(ids.map((transaction_id) => ({ transaction_id, tag_id: tagId })), {
      onConflict: "transaction_id,tag_id",
    });
  if (error) throw new Error(error.message);
  revalidatePath("/movimentacoes");
}

export async function createRule(match: string, category: string) {
  const m = match.trim();
  const c = category.trim();
  if (!m || !c) throw new Error("Descrição e categoria são obrigatórias");
  const sb = supabaseServer();
  const { error } = await sb.from("category_rules").insert({ match: m, category: c });
  if (error) throw new Error(error.message);
  revalidatePath("/movimentacoes");
}

// ---------- investimentos ----------
export async function updateInvestment(
  id: string,
  fields: { issuer?: string; indexer?: string; rate?: string; maturity_date?: string; invested_override?: string; held_since?: string; current_value?: string; amount_invested?: string }
) {
  const sb = supabaseServer();
  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t.slice(0, 120);
  };
  const patch: Record<string, string | number | null> = {
    issuer: clean(fields.issuer),
    indexer: clean(fields.indexer),
    rate: clean(fields.rate),
    maturity_date: clean(fields.maturity_date),
    updated_at: new Date().toISOString(), // alimenta o alerta de "atualizar no mês"
  };
  if (typeof patch.maturity_date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(patch.maturity_date)) {
    throw new Error("Vencimento no formato AAAA-MM-DD");
  }
  const baseRaw = (fields.invested_override ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (baseRaw !== "") {
    const base = Number(baseRaw);
    if (!Number.isFinite(base) || base < 0) throw new Error("Base de custo inválida");
    patch.invested_override = base;
  } else {
    patch.invested_override = null;
  }
  const held = (fields.held_since ?? "").trim();
  if (held !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(held)) throw new Error("Início no formato AAAA-MM-DD");
    patch.held_since = held;
  } else {
    patch.held_since = null;
  }
  // Valores só editáveis em posição manual (BTC etc.) — sync é dono das demais.
  if (fields.current_value !== undefined || fields.amount_invested !== undefined) {
    const { data: row } = await sb.from("investments").select("pluggy_id").eq("id", id).maybeSingle();
    if (!row || !String((row as { pluggy_id: string }).pluggy_id).startsWith("manual:")) {
      throw new Error("Só posições manuais têm valor editável");
    }
    const cv = parseBRNumber(fields.current_value ?? "");
    const ai = parseBRNumber(fields.amount_invested ?? "");
    if (cv === null || ai === null) throw new Error("Valores inválidos");
    patch.current_value = cv;
    patch.amount_invested = ai;
  }
  const { error } = await sb.from("investments").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/investimentos");
}

export async function addInvTag(id: string, name: string) {
  const sb = supabaseServer();
  const tagId = await ensureTag(sb, name);
  const { error } = await sb
    .from("investment_tags")
    .upsert({ investment_id: id, tag_id: tagId }, { onConflict: "investment_id,tag_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/investimentos");
}

export async function removeInvTag(id: string, tagId: string) {
  const sb = supabaseServer();
  const { error } = await sb
    .from("investment_tags")
    .delete()
    .eq("investment_id", id)
    .eq("tag_id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath("/investimentos");
}

export async function setInvestmentClosed(id: string, closed: boolean) {
  const sb = supabaseServer();
  const { error } = await sb.from("investments").update({ closed_manual: closed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/investimentos");
}

function parseBRNumber(raw: string): number | null {
  const t = raw.trim().replace(/^R\$\s?/, "").replace(/\s/g, "");
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(norm);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export async function addManualInvestment(_prev: unknown, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const type = String(formData.get("type") ?? "other").slice(0, 40);
  const invested = parseBRNumber(String(formData.get("invested") ?? ""));
  const current = parseBRNumber(String(formData.get("current") ?? ""));
  if (!name || invested === null || current === null) {
    return { ok: false, message: "Preencha nome, aplicado e atual com valores válidos." };
  }
  const sb = supabaseServer();
  const key = createHash("sha256").update(`${name}|${type}|${Date.now()}`).digest("hex").slice(0, 16);
  const now = new Date().toISOString();
  const { error } = await sb.from("investments").insert({
    pluggy_id: `manual:${key}`,
    name,
    type,
    amount_invested: invested,
    current_value: current,
    currency: "BRL",
    last_seen_at: now,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/investimentos");
  return { ok: true, message: `“${name}” adicionado.` };
}

// ---------- import CSV ----------
function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2]}-${m[1]}`;
  }
  return null;
}

function parseAmount(s: string): number | null {
  let t = s.trim().replace(/^R\$\s?/, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(t)) t = "-" + t.slice(1, -1);
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function detectDelim(headerLine: string): string {
  // conta separadores fora de aspas; prefere ; (padrão BR com vírgula decimal)
  let semi = 0;
  let comma = 0;
  let q = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') q = !q;
    else if (!q && c === ";") semi++;
    else if (!q && c === ",") comma++;
  }
  return semi > 0 ? ";" : ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function importCsv(_prev: unknown, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Selecione um arquivo CSV." };
  }
  if (file.size > 2_000_000) return { ok: false, message: "Arquivo maior que 2 MB." };
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { ok: false, message: "CSV vazio ou sem cabeçalho." };

  const delim = detectDelim(lines[0]);
  const header = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  const ci = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = ci(["date", "data"]);
  const iDesc = ci(["description", "descri", "historico", "lançamento", "lancamento"]);
  const iAmt = ci(["amount", "valor"]);
  const iCat = ci(["categor"]);
  const iAcc = ci(["account", "conta"]);
  if (iDate < 0 || iDesc < 0 || iAmt < 0) {
    return { ok: false, message: "Cabeçalho precisa de data, descrição e valor (date,description,amount)." };
  }

  const sb = supabaseServer();
  const { data: accounts } = await sb.from("accounts").select("id,bank,name");
  const accList = (accounts ?? []) as { id: string; bank: string | null; name: string | null }[];

  let ok = 0;
  const errors: string[] = [];
  for (let r = 1; r < lines.length && ok + errors.length < 2000; r++) {
    const cols = splitCsvLine(lines[r], delim);
    const date = parseDate(cols[iDate] ?? "");
    const description = (cols[iDesc] ?? "").slice(0, 300);
    const amount = parseAmount(cols[iAmt] ?? "");
    if (!date || !description || amount === null) {
      errors.push(`linha ${r + 1}: inválida`);
      continue;
    }
    const category = iCat >= 0 ? (cols[iCat] ?? "").slice(0, 120) || null : null;
    const accHint = (iAcc >= 0 ? cols[iAcc] ?? "" : "").toLowerCase();
    const matched = accHint
      ? accList.find((a) => (a.name ?? "").toLowerCase().includes(accHint) || (a.bank ?? "").toLowerCase() === accHint)
      : undefined;
    const key = createHash("sha256")
      .update(`${date}|${description}|${amount}|${accHint}`)
      .digest("hex")
      .slice(0, 32);
    const { error } = await sb.from("transactions").upsert(
      {
        pluggy_id: `csv:${key}`,
        account_id: matched?.id ?? null,
        date,
        description,
        amount,
        currency: "BRL",
        category_pluggy: category,
        status: "POSTED",
      },
      { onConflict: "pluggy_id" }
    );
    if (error) errors.push(`linha ${r + 1}: ${error.message}`);
    else ok++;
  }
  revalidatePath("/movimentacoes");
  const msg = `${ok} lançamento(s) importado(s).` + (errors.length ? ` ${errors.length} erro(s) (ex.: ${errors[0]}).` : "");
  return { ok: errors.length === 0, message: msg };
}
