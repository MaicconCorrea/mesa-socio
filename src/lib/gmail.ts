// (copiado do Painel DP) Gmail pela conta de serviço com delegação em todo o domínio (Google Workspace): o painel age "em nome de" cada usuário,
// e cada pessoa só vê a própria caixa (o e-mail do login). Requer, no admin.google.com, autorizar o client_id da conta
// de serviço com o escopo https://www.googleapis.com/auth/gmail.modify — e a Gmail API ativa no projeto do Google Cloud.
import crypto from "node:crypto";
import { ESCOPOS, tokenGoogle } from "./google";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const token = (conta: string) => tokenGoogle(ESCOPOS.gmail, conta);

async function api(conta: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token(conta)}` }, cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled/i.test(t)) throw new Error("A Gmail API não está ativa no projeto do Google Cloud da conta de serviço.");
    throw new Error(`Gmail ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json();
}

// ---------- leitura ----------
const cabecalho = (hs: any[] = [], nome: string) => hs.find(h => h.name?.toLowerCase() === nome.toLowerCase())?.value ?? "";
const b64dec = (s: string) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const emailDe = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
export const nomeDe = (from: string) => (from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || emailDe(from));

export type ResumoThread = { id: string; assunto: string; de: string; deEmail: string; quando: string; snippet: string; naoLido: boolean; temAnexo: boolean; mensagens: number; ultimaDeFora: string | null; ultimaMinha: boolean; automatico: boolean; ultimaMsgId: string };
export async function listarThreads(conta: string, q: string, pageToken?: string, max = 30): Promise<{ threads: ResumoThread[]; proxima: string | null }> {
  const p = new URLSearchParams({ q, maxResults: String(max) }); if (pageToken) p.set("pageToken", pageToken);
  const j = await api(conta, `/threads?${p.toString()}`);
  const ids: string[] = (j?.threads ?? []).map((t: any) => t.id);
  const threads = await Promise.all(ids.map(id => resumoThread(conta, id).catch(() => null)));
  return { threads: threads.filter(Boolean) as ResumoThread[], proxima: j?.nextPageToken ?? null };
}
export async function resumoThread(conta: string, id: string): Promise<ResumoThread> {
  const t = await api(conta, `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=Auto-Submitted&metadataHeaders=Precedence`);
  const msgs: any[] = t.messages ?? [];
  const ult = msgs[msgs.length - 1]; const prim = msgs[0];
  const deFora = [...msgs].reverse().find(m => emailDe(cabecalho(m.payload?.headers, "From")) !== conta.toLowerCase());
  const from = cabecalho((deFora ?? ult).payload?.headers, "From");
  return {
    id, assunto: cabecalho(prim?.payload?.headers, "Subject") || "(sem assunto)", de: nomeDe(from), deEmail: emailDe(from),
    quando: new Date(Number(ult?.internalDate ?? Date.now())).toISOString(), snippet: ult?.snippet ?? "",
    naoLido: msgs.some(m => (m.labelIds ?? []).includes("UNREAD")), temAnexo: msgs.some(m => JSON.stringify(m.payload ?? {}).includes('"attachmentId"')),
    mensagens: msgs.length, ultimaDeFora: deFora ? new Date(Number(deFora.internalDate)).toISOString() : null,
    ultimaMinha: emailDe(cabecalho(ult?.payload?.headers, "From")) === conta.toLowerCase(),
    automatico: ehAutomatico(from, (deFora ?? ult)?.payload?.headers ?? []) || /^(convite|invitation|convite atualizado|updated invitation|aceito|accepted|recusado|declined|talvez|tentatively|evento cancelado|canceled event|lembrete)\b/i.test(cabecalho(prim?.payload?.headers, "Subject")),
    ultimaMsgId: ult?.id ?? "",
  };
}

export type Anexo = { msgId: string; attId: string; nome: string; mime: string; tamanho: number };
export type MensagemEmail = { id: string; de: string; deEmail: string; para: string; cc: string; data: string; assunto: string; html: string | null; texto: string | null; anexos: Anexo[]; messageId: string; references: string };
export async function lerThread(conta: string, id: string): Promise<{ id: string; assunto: string; mensagens: MensagemEmail[] }> {
  const t = await api(conta, `/threads/${id}?format=full`);
  const mensagens: MensagemEmail[] = (t.messages ?? []).map((m: any) => {
    let html: string | null = null, texto: string | null = null; const anexos: Anexo[] = [];
    const andar = (p: any) => {
      if (!p) return;
      if (p.filename && p.body?.attachmentId) anexos.push({ msgId: m.id, attId: p.body.attachmentId, nome: p.filename, mime: p.mimeType, tamanho: p.body.size ?? 0 });
      else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64dec(p.body.data).toString("utf8");
      else if (p.mimeType === "text/plain" && p.body?.data && !texto) texto = b64dec(p.body.data).toString("utf8");
      (p.parts ?? []).forEach(andar);
    };
    andar(m.payload);
    const h = m.payload?.headers ?? [];
    return { id: m.id, de: nomeDe(cabecalho(h, "From")), deEmail: emailDe(cabecalho(h, "From")), para: cabecalho(h, "To"), cc: cabecalho(h, "Cc"),
      data: new Date(Number(m.internalDate)).toISOString(), assunto: cabecalho(h, "Subject"), html, texto, anexos,
      messageId: cabecalho(h, "Message-ID") || cabecalho(h, "Message-Id"), references: cabecalho(h, "References") };
  });
  return { id, assunto: mensagens[0]?.assunto || "(sem assunto)", mensagens };
}
export async function baixarAnexo(conta: string, msgId: string, attId: string): Promise<Buffer> {
  const j = await api(conta, `/messages/${msgId}/attachments/${attId}`);
  return b64dec(j.data);
}
export async function modificarThread(conta: string, id: string, add: string[], remove: string[]) {
  return api(conta, `/threads/${id}/modify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
}
export async function testarAcesso(conta: string) { return api(conta, `/profile`); }

// ---------- envio ----------
const cabUtf8 = (s: string) => /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
const quebra76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");
export async function enviarEmail(conta: string, nomeRemetente: string, e: { para: string; cc?: string; assunto: string; corpo: string; threadId?: string; inReplyTo?: string; references?: string;
  anexos?: { nome: string; bytes: Buffer; mime?: string }[] }) {
  const limite = "=_painel_" + crypto.randomBytes(8).toString("hex");
  const linhas = [
    `From: ${cabUtf8(nomeRemetente)} <${conta}>`, `To: ${e.para}`, ...(e.cc ? [`Cc: ${e.cc}`] : []), `Subject: ${cabUtf8(e.assunto)}`, "MIME-Version: 1.0",
    ...(e.inReplyTo ? [`In-Reply-To: ${e.inReplyTo}`, `References: ${[e.references, e.inReplyTo].filter(Boolean).join(" ")}`] : []),
    `Content-Type: multipart/mixed; boundary="${limite}"`, "",
    `--${limite}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", quebra76(Buffer.from(e.corpo).toString("base64")),
  ];
  for (const a of e.anexos ?? []) linhas.push(`--${limite}`, `Content-Type: ${a.mime || "application/octet-stream"}; name="${cabUtf8(a.nome)}"`, "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${cabUtf8(a.nome)}"`, "", quebra76(a.bytes.toString("base64")));
  linhas.push(`--${limite}--`, "");
  const raw = Buffer.from(linhas.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return api(conta, `/messages/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw, ...(e.threadId ? { threadId: e.threadId } : {}) }) });
}

// Texto corrido do e-mail (pra IA e pra criar tarefa)
export function textoDaThread(t: { mensagens: MensagemEmail[] }): string {
  return t.mensagens.map(m => {
    const corpo = m.texto ?? (m.html ? m.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ") : "");
    return `De: ${m.de} <${m.deEmail}> — ${new Date(m.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n${corpo.slice(0, 6000)}${m.anexos.length ? `\n[anexos: ${m.anexos.map(a => a.nome).join(", ")}]` : ""}`;
  }).join("\n\n---\n\n");
}

// Quantas conversas não lidas na caixa de entrada (balão do menu E-mail)
export async function naoLidos(conta: string): Promise<number> {
  const j = await api(conta, "/labels/INBOX");
  return Number(j?.threadsUnread ?? 0);
}

// E-mail de robô (newsletter, notificação, sistema) — não entra em "esperando resposta"
export function ehAutomatico(from: string, hs: any[]): boolean {
  const e = emailDe(from);
  if (/no-?reply|nao-?responda|naoresponda|notifica|newsletter|mailer|bounce|postmaster|marketing|news@|info@|boleto|cobranca@|faturamento@|nfe@|nfse|alerts?@|calendar-notification|drive-shares/i.test(e)) return true;
  if (cabecalho(hs, "List-Unsubscribe")) return true;
  const auto = cabecalho(hs, "Auto-Submitted"); if (auto && auto !== "no") return true;
  if (/bulk|list|junk/i.test(cabecalho(hs, "Precedence"))) return true;
  return false;
}
