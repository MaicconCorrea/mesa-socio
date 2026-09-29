// Conversa com a Evolution API (evolution.outtax.space)

function base() {
  return (process.env.EVOLUTION_URL || "").replace(/\/+$/, "");
}

export function instancias(): string[] {
  return (process.env.EVOLUTION_INSTANCIAS || "socio-1200,socio-3710")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

async function evo(path: string, init: RequestInit = {}) {
  try {
    const r = await fetch(base() + path, {
      ...init,
      headers: {
        apikey: process.env.EVOLUTION_API_KEY || "",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const txt = await r.text();
    let json: any = txt;
    try { json = JSON.parse(txt); } catch { /* texto puro */ }
    return { ok: r.ok, status: r.status, json };
  } catch (e: any) {
    return { ok: false, status: 0, json: { erro: e?.message || String(e) } };
  }
}

export async function estado(inst: string) {
  const r = await evo(`/instance/connectionState/${encodeURIComponent(inst)}`);
  return r.ok ? (r.json?.instance?.state || r.json?.state || "desconhecido") : `erro ${r.status}`;
}

export async function webhookAtual(inst: string) {
  const r = await evo(`/webhook/find/${encodeURIComponent(inst)}`);
  if (!r.ok || !r.json) return null;
  const w = r.json.webhook || r.json;
  return { enabled: !!w.enabled, url: w.url || "" };
}

export async function ligarWebhook(inst: string, url: string) {
  const events = ["MESSAGES_UPSERT"];
  // Formato da v2.1+ (objeto "webhook")
  let r = await evo(`/webhook/set/${encodeURIComponent(inst)}`, {
    method: "POST",
    body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: false, events } }),
  });
  if (r.ok) return { ok: true, detalhe: "" };
  // Formato antigo da v2.0
  r = await evo(`/webhook/set/${encodeURIComponent(inst)}`, {
    method: "POST",
    body: JSON.stringify({ enabled: true, url, webhookByEvents: false, webhookBase64: false, events }),
  });
  return { ok: r.ok, detalhe: r.ok ? "" : JSON.stringify(r.json).slice(0, 300) };
}

export async function nomeDoGrupo(inst: string, jid: string): Promise<string | null> {
  const r = await evo(`/group/findGroupInfos/${encodeURIComponent(inst)}?groupJid=${encodeURIComponent(jid)}`);
  if (!r.ok) return null;
  return r.json?.subject || r.json?.[0]?.subject || null;
}

// Tira o texto de qualquer tipo de mensagem do WhatsApp
export function extrairTexto(m: any): string | null {
  if (!m) return null;
  if (m.ephemeralMessage?.message) return extrairTexto(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return extrairTexto(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return extrairTexto(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) return extrairTexto(m.documentWithCaptionMessage.message);
  if (typeof m.conversation === "string" && m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return `[imagem] ${m.imageMessage.caption || ""}`.trim();
  if (m.videoMessage) return `[vídeo] ${m.videoMessage.caption || ""}`.trim();
  if (m.audioMessage) return "[áudio]";
  if (m.documentMessage)
    return `[documento: ${m.documentMessage.fileName || m.documentMessage.title || "arquivo"}] ${m.documentMessage.caption || ""}`.trim();
  if (m.contactMessage) return `[contato: ${m.contactMessage.displayName || ""}]`;
  if (m.locationMessage) return "[localização]";
  if (m.pollCreationMessage || m.pollCreationMessageV3) return `[enquete] ${(m.pollCreationMessage || m.pollCreationMessageV3).name || ""}`;
  return null; // figurinha, reação, apagada, sistema: ignora
}

// Procura o contextInfo (menções e mensagem respondida) em qualquer tipo de mensagem
export function contexto(m: any, raiz?: any): { mencionados: string[]; respondeuA: string | null } {
  const achar = (o: any): any => {
    if (!o || typeof o !== "object") return null;
    if (o.contextInfo) return o.contextInfo;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === "object") { const r = achar(v); if (r) return r; }
    }
    return null;
  };
  const ctx = raiz?.contextInfo || achar(m) || {};
  return { mencionados: ctx.mentionedJid || [], respondeuA: ctx.participant || null };
}

export function soNumero(jid?: string | null) {
  return (jid || "").split("@")[0].split(":")[0];
}

// Tipo e dados do arquivo (se a mensagem tiver mídia)
export function infoMidia(m: any): { tipo: string; mime: string | null; nome: string | null } {
  if (!m) return { tipo: "texto", mime: null, nome: null };
  if (m.ephemeralMessage?.message) return infoMidia(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return infoMidia(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return infoMidia(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) return infoMidia(m.documentWithCaptionMessage.message);
  if (m.imageMessage) return { tipo: "imagem", mime: m.imageMessage.mimetype || "image/jpeg", nome: null };
  if (m.videoMessage) return { tipo: "video", mime: m.videoMessage.mimetype || "video/mp4", nome: null };
  if (m.audioMessage) return { tipo: "audio", mime: m.audioMessage.mimetype || "audio/ogg", nome: null };
  if (m.documentMessage) return { tipo: "documento", mime: m.documentMessage.mimetype || "application/octet-stream", nome: m.documentMessage.fileName || m.documentMessage.title || "arquivo" };
  return { tipo: "texto", mime: null, nome: null };
}

// Baixa a mídia de uma mensagem (a Evolution devolve em base64)
export async function baixarMidia(inst: string, msgId: string): Promise<{ bytes: Buffer; mime: string; nome: string | null } | null> {
  const r = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(inst)}`, {
    method: "POST", body: JSON.stringify({ message: { key: { id: msgId } }, convertToMp4: false }),
  });
  if (!r.ok || !r.json?.base64) return null;
  return { bytes: Buffer.from(r.json.base64, "base64"), mime: r.json.mimetype || "application/octet-stream", nome: r.json.fileName || null };
}

// Envia texto pelo número (instância) da conversa
export async function enviarTexto(inst: string, jid: string, texto: string) {
  const numero = jid.endsWith("@g.us") ? jid : jid.split("@")[0];
  const r = await evo(`/message/sendText/${encodeURIComponent(inst)}`, {
    method: "POST", body: JSON.stringify({ number: numero, text: texto }),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { id: r.json?.key?.id || `env-${Date.now()}` };
}

// ---------------- v0.4: WhatsApp completo ----------------
const enc = encodeURIComponent;
export const numeroEnvio = (jid: string) => (jid.endsWith("@g.us") ? jid : jid.split("@")[0]);

// Lista de conversas do celular (Evolution guarda as conversas da instância)
export async function listarChats(inst: string): Promise<any[]> {
  const r = await evo(`/chat/findChats/${enc(inst)}`, { method: "POST", body: JSON.stringify({}) });
  if (!r.ok) return [];
  return Array.isArray(r.json) ? r.json : (r.json?.chats || r.json?.records || []);
}

// Todos os grupos (nome de cada um) numa chamada só
export async function listarGrupos(inst: string): Promise<{ id: string; subject: string }[]> {
  const r = await evo(`/group/fetchAllGroups/${enc(inst)}?getParticipants=false`);
  if (!r.ok || !Array.isArray(r.json)) return [];
  return r.json.map((g: any) => ({ id: g.id, subject: g.subject }));
}

// Últimas mensagens de uma conversa (histórico guardado na Evolution)
export async function historico(inst: string, jid: string, qtd = 60): Promise<any[]> {
  const r = await evo(`/chat/findMessages/${enc(inst)}`, {
    method: "POST", body: JSON.stringify({ where: { key: { remoteJid: jid } }, page: 1, offset: qtd }),
  });
  if (!r.ok) return [];
  const j = r.json;
  return Array.isArray(j) ? j : (j?.messages?.records || j?.records || j?.messages || []);
}

export async function enviarTextoCitando(inst: string, jid: string, texto: string, citada?: { id: string; texto: string; deMim: boolean } | null) {
  const body: any = { number: numeroEnvio(jid), text: texto };
  if (citada) body.quoted = { key: { id: citada.id, fromMe: citada.deMim, remoteJid: jid }, message: { conversation: citada.texto || "" } };
  const r = await evo(`/message/sendText/${enc(inst)}`, { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { id: r.json?.key?.id || `env-${Date.now()}` };
}

export async function enviarArquivo(inst: string, jid: string, a: { base64: string; mime: string; nome: string; legenda?: string }) {
  const tipo = a.mime.startsWith("image/") ? "image" : a.mime.startsWith("video/") ? "video" : a.mime.startsWith("audio/") ? "audio" : "document";
  const r = await evo(`/message/sendMedia/${enc(inst)}`, {
    method: "POST",
    body: JSON.stringify({ number: numeroEnvio(jid), mediatype: tipo, mimetype: a.mime, caption: a.legenda || "", media: a.base64, fileName: a.nome }),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { id: r.json?.key?.id || `env-${Date.now()}`, tipo };
}

export async function enviarAudio(inst: string, jid: string, base64: string) {
  const r = await evo(`/message/sendWhatsAppAudio/${enc(inst)}`, {
    method: "POST", body: JSON.stringify({ number: numeroEnvio(jid), audio: base64, encoding: true }),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { id: r.json?.key?.id || `env-${Date.now()}` };
}

// Marca como lida no celular (dois tracinhos azuis pro contato)
export async function marcarLidas(inst: string, jid: string, ids: { id: string; participante?: string | null }[]) {
  if (!ids.length) return;
  await evo(`/chat/markMessageAsRead/${enc(inst)}`, {
    method: "POST",
    body: JSON.stringify({ readMessages: ids.map(i => ({ remoteJid: jid, fromMe: false, id: i.id, ...(i.participante ? { participant: i.participante } : {}) })) }),
  });
}

// Confere se o número tem WhatsApp e devolve o jid certo (resolve o 9º dígito)
export async function conferirNumero(inst: string, numero: string): Promise<string | null> {
  const r = await evo(`/chat/whatsappNumbers/${enc(inst)}`, { method: "POST", body: JSON.stringify({ numbers: [numero] }) });
  const item = Array.isArray(r.json) ? r.json[0] : null;
  return item?.exists ? (item.jid || `${numero}@s.whatsapp.net`) : null;
}

export async function fotoPerfil(inst: string, jid: string): Promise<string | null> {
  const r = await evo(`/chat/fetchProfilePictureUrl/${enc(inst)}`, { method: "POST", body: JSON.stringify({ number: numeroEnvio(jid) }) });
  return r.ok ? (r.json?.profilePictureUrl || null) : null;
}

// Número (dono) de cada instância — pra saber quando citam você no histórico
const donos = new Map<string, string>();
export async function donoDaInstancia(inst: string): Promise<string> {
  if (donos.has(inst)) return donos.get(inst)!;
  const r = await evo(`/instance/fetchInstances?instanceName=${enc(inst)}`);
  const i = Array.isArray(r.json) ? r.json[0] : r.json;
  const dono = soNumero(i?.ownerJid || i?.instance?.owner || i?.owner || "");
  if (dono) donos.set(inst, dono);
  return dono;
}
