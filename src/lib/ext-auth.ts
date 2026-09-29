// Login da extensão pelo Google: confere o token direto no Google (e-mail @outtax.com.br + nosso cliente OAuth)
import { NextRequest, NextResponse } from "next/server";

const dominio = () => (process.env.DOMINIO_EMPRESA || "outtax.com.br").toLowerCase();
const cache = new Map<string, { em: number; email: string; nome: string }>();

export async function usuarioDaExtensao(req: NextRequest): Promise<{ email: string; nome: string } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.length < 20) return null;
  const c = cache.get(token); if (c && Date.now() - c.em < 5 * 60000) return c;
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const clientes = (process.env.EXT_OAUTH_CLIENT_ID || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!clientes.includes(j.azp || j.aud)) return null;
  const email = String(j.email || "").toLowerCase();
  if (!email.endsWith("@" + dominio()) || String(j.email_verified) !== "true") return null;
  // nome: pelo userinfo (mesmo token)
  let nome = email.split("@")[0];
  try {
    const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json());
    if (u?.name) nome = u.name;
  } catch { /* fica o e-mail */ }
  const out = { email, nome, em: Date.now() };
  cache.set(token, out);
  return out;
}
export const naoLogado = () => NextResponse.json({ erro: "Entre com a sua conta Google da Outtax na extensão." }, { status: 401 });
