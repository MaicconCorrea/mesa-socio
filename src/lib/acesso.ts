// Quem pode usar a Mesa (regra única — middleware, login do portal e rotas de chaves globais).
// - Entram: sócios ATIVOS da tabela `socios` + administradores da Mesa (MESA_ADMINS).
// - Só administradores leem/alteram as configurações GLOBAIS (dono "*": chaves_painel, chave_gravador).
// - Admin que não é sócio (ex.: time de desenvolvimento) entra, mas não fica em `socios` (os crons não rodam para ele).
// Roda também no middleware (Edge): sem imports de Node, lê `socios` direto pela API REST do Supabase.

const ADMINS_PADRAO = "maiccon@outtax.com.br,lucas.teles@outtax.com.br";
export const SEM_ACESSO_MESA = "Seu e-mail não tem acesso à Mesa do Sócio.";
export const SO_ADMIN_GLOBAIS = "Só administradores alteram as chaves globais.";

const norm = (e?: string | null) => String(e || "").trim().toLowerCase();

export function adminsMesa(): string[] {
  return (process.env.MESA_ADMINS || ADMINS_PADRAO).split(",").map(norm).filter(Boolean);
}

export function ehAdminMesa(email?: string | null): boolean {
  const e = norm(email);
  return !!e && adminsMesa().includes(e);
}

// sócios ativos com cache curto (60 s); se a leitura falhar, usa o último resultado conhecido
let cache: { em: number; emails: Set<string> } | null = null;
async function sociosAtivos(): Promise<Set<string>> {
  if (cache && Date.now() - cache.em < 60000) return cache.emails;
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !chave) throw new Error("Supabase não configurado");
    const r = await fetch(`${base.replace(/\/$/, "")}/rest/v1/socios?select=email&ativo=eq.true`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`socios: HTTP ${r.status}`);
    const lista: { email: string }[] = await r.json();
    cache = { em: Date.now(), emails: new Set(lista.map(s => norm(s.email)).filter(Boolean)) };
    return cache.emails;
  } catch (e) {
    if (cache) return cache.emails; // falha momentânea: vale o último conhecido
    throw e; // sem como conferir: quem chama decide (não libera)
  }
}

export async function ehSocioAtivo(email?: string | null): Promise<boolean> {
  const e = norm(email);
  return !!e && (await sociosAtivos()).has(e);
}

// true = pode entrar; lança erro se não deu para conferir (nunca libera por engano)
export async function podeEntrar(email?: string | null): Promise<boolean> {
  const e = norm(email);
  if (!e) return false;
  if (ehAdminMesa(e)) return true;
  return ehSocioAtivo(e);
}
