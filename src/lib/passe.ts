// "Passe" de abertura de módulo: um token curto (60 s) assinado com PORTAL_SEGREDO.
// O Painel Outtax (portal) gera; a Mesa verifica e cria a própria sessão. Copiado de painel-outtax/src/lib/passe.ts
// (só a verificação; gerarPasse fica só no portal). Só WebCrypto: roda no Edge e no Node.

export type Passe = { email: string; nome: string; modulo: string; exp: number; n: string };

const enc = new TextEncoder();
const dec = new TextDecoder();
export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  u.forEach(c => (s += String.fromCharCode(c)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(t);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

async function chavePortal() {
  const s = process.env.PORTAL_SEGREDO;
  if (!s) throw new Error("PORTAL_SEGREDO não configurado na Vercel.");
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Verifica o passe no módulo. Devolve os dados se a assinatura bater, se não venceu
 * e se foi emitido para este módulo; senão devolve null.
 */
export async function verificarPasse(passe: string | null | undefined, moduloEsperado: string): Promise<Passe | null> {
  if (!passe || !passe.includes(".")) return null;
  const [corpo, sig] = passe.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await chavePortal(), unb64u(sig), enc.encode(corpo));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64u(corpo))) as Passe;
    if (!p.exp || p.exp < Date.now()) return null;
    if (p.modulo !== moduloEsperado) return null;
    if (!p.email || !p.n) return null;
    return p;
  } catch {
    return null;
  }
}
