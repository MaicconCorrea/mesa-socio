// Login único: o Painel Outtax manda para cá com ?passe=<passe> (assinado, 60 s).
// A Mesa usa Supabase Auth: entra quem tem usuário no Auth do projeto (as mesmas regras do signInWithPassword,
// sem a senha: e-mail confirmado e não bloqueado). A sessão é a mesma do login: cookies do @supabase/ssr,
// criados com um link mágico gerado no servidor (não manda e-mail) e confirmado na hora.
import { NextResponse, type NextRequest } from "next/server";
import { verificarPasse } from "@/lib/passe";
import { dbGlobal } from "@/lib/db";
import { sbServer } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VENCEU = "O link do Painel Outtax venceu. Entre de novo pelo portal ou faça login aqui.";
const SEM_ACESSO = "Seu e-mail ainda não tem acesso a este painel. Peça ao administrador.";

// Reforço contra reuso: guarda os passes (n) usados nos últimos minutos
const usados = new Map<string, number>();
function jaUsado(n: string) {
  const agora = Date.now();
  usados.forEach((exp, k) => { if (exp < agora) usados.delete(k); });
  if (usados.has(n)) return true;
  usados.set(n, agora + 5 * 60000);
  return false;
}

function paraLogin(req: NextRequest, msg: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("erro", msg);
  return NextResponse.redirect(url, 303);
}

async function acharUsuario(email: string): Promise<User | null> {
  const admin = dbGlobal().auth.admin;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const lista: User[] = (data as any)?.users || [];
    const u = lista.find(x => (x.email || "").toLowerCase() === email);
    if (u) return u;
    if (lista.length < 1000) return null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const p = await verificarPasse(req.nextUrl.searchParams.get("passe"), "mesa");
  if (!p || jaUsado(p.n)) return paraLogin(req, VENCEU);
  const email = p.email.toLowerCase();

  try {
    // mesmas condições do login por senha (Supabase Auth): usuário existe, e-mail confirmado, não bloqueado
    const u = await acharUsuario(email);
    const bloqueado = !!(u as any)?.banned_until && new Date((u as any).banned_until).getTime() > Date.now();
    if (!u || !u.email_confirmed_at || bloqueado || (u as any).deleted_at) return paraLogin(req, SEM_ACESSO);

    // cria a sessão igual ao login: link mágico (só o token, sem e-mail) confirmado aqui -> cookies do Supabase
    const { data: link, error: e1 } = await dbGlobal().auth.admin.generateLink({ type: "magiclink", email: u.email! });
    if (e1 || !link?.properties?.hashed_token) throw e1 || new Error("sem token");
    const { error: e2 } = await sbServer().auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (e2) throw e2;
  } catch (e) {
    console.error("[auth/portal] origem=portal falhou:", (e as any)?.message || e);
    return paraLogin(req, VENCEU);
  }

  console.log(`[auth/portal] login origem=portal ${email}`);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
