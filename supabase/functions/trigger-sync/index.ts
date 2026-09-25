// Supabase Edge Function — trigger-sync (Fase 6; placeholder na Fase 1).
// Troca: recebe POST autenticado e dispara o workflow_dispatch do GitHub Actions.
// Secrets da function: GITHUB_TOKEN (escopo actions:write), GITHUB_REPO (owner/repo), GITHUB_WORKFLOW (sync.yml).
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO");
  const workflow = Deno.env.get("GITHUB_WORKFLOW") ?? "sync.yml";
  if (!token || !repo) return new Response("trigger-sync não configurado", { status: 501 });
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  return new Response(res.ok ? "Sync disparado" : await res.text(), { status: res.ok ? 202 : 502 });
});
