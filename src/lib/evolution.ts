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
