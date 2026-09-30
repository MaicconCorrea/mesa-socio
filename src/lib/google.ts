// Google Workspace pela conta de serviço com delegação em todo o domínio (a mesma do Painel DP).
// O painel age "em nome de" maiccon@outtax.com.br. Cada escopo tem o seu token, assim se a Agenda ainda
// não estiver autorizada no admin.google.com o Gmail continua funcionando (e vice-versa).
import crypto from "node:crypto";

export const ESCOPOS = {
  gmail: "https://www.googleapis.com/auth/gmail.modify",
  agenda: "https://www.googleapis.com/auth/calendar",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  chatEspacos: "https://www.googleapis.com/auth/chat.spaces.readonly",
  chatMensagens: "https://www.googleapis.com/auth/chat.messages",
  chatMembros: "https://www.googleapis.com/auth/chat.memberships.readonly",
  diretorio: "https://www.googleapis.com/auth/directory.readonly",
  usuarios: "https://www.googleapis.com/auth/admin.directory.user.readonly",
  grupos: "https://www.googleapis.com/auth/admin.directory.group.readonly",
  contatos: "https://www.googleapis.com/auth/contacts.readonly",
};

export const minhaConta = () => (process.env.MEU_EMAIL || "maiccon@outtax.com.br").toLowerCase();
export const googleConfigurado = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function credenciais() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado na Vercel (copie do projeto do Painel DP).");
  return JSON.parse(raw) as { client_email: string; private_key: string; client_id?: string };
}
export function clientIdContaServico() { try { return credenciais().client_id ?? ""; } catch { return ""; } }

const cache = new Map<string, { token: string; expira: number }>();
export async function tokenGoogle(escopo: string, conta = minhaConta()): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const chave = `${conta}|${escopo}`;
  const c0 = cache.get(chave); if (c0 && c0.expira > agora + 60) return c0.token;
  const c = credenciais();
  const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const cab = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64u(JSON.stringify({ iss: c.client_email, sub: conta, scope: escopo, aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 }));
  const jwt = `${cab}.${corpo}.${b64u(crypto.sign("RSA-SHA256", Buffer.from(`${cab}.${corpo}`), c.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) {
    const e = String(j.error_description ?? j.error ?? r.status);
    const qual = escopo === ESCOPOS.agenda ? "a Agenda" : escopo === ESCOPOS.drive ? "o Drive (reuniões)" : escopo.includes("chat") ? "o Google Chat" : escopo === ESCOPOS.diretorio ? "o diretório (nomes do Chat)" : "o Gmail";
    throw new Error(/unauthorized_client|not authorized/i.test(e)
      ? `O Google ainda não autorizou o painel a acessar ${qual} (falta o escopo na delegação em todo o domínio no admin.google.com).`
      : `Google: ${e}`);
  }
  cache.set(chave, { token: j.access_token, expira: agora + Number(j.expires_in ?? 3600) });
  return j.access_token;
}

// Token da própria conta de serviço (sem agir em nome de ninguém) — usado no Speech-to-Text
const cacheSvc = new Map<string, { token: string; expira: number }>();
export async function tokenServico(escopo = "https://www.googleapis.com/auth/cloud-platform"): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const c0 = cacheSvc.get(escopo); if (c0 && c0.expira > agora + 60) return c0.token;
  const c = credenciais();
  const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const cab = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64u(JSON.stringify({ iss: c.client_email, scope: escopo, aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 }));
  const jwt = `${cab}.${corpo}.${b64u(crypto.sign("RSA-SHA256", Buffer.from(`${cab}.${corpo}`), c.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Google: ${j.error_description ?? j.error ?? r.status}`);
  cacheSvc.set(escopo, { token: j.access_token, expira: agora + Number(j.expires_in ?? 3600) });
  return j.access_token;
}
