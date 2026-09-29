// Google Chat do Maiccon (pela conta de serviço com delegação no domínio).
// Cada espaço/conversa do Chat vira uma "conversa" da Mesa com instancia = "gchat" — assim IA, sugestões,
// tarefas, avisos e "esperando resposta" funcionam igual ao WhatsApp.
import { db } from "./db";
import { ESCOPOS, minhaConta, tokenGoogle } from "./google";
import { lerConfig, gravarConfig } from "./config";
import { notificar } from "./push";

const API = "https://chat.googleapis.com/v1";
export const GCHAT = "gchat";
const MEU_NOME = /\bmai+c+o+[nm]\b/i;

async function api(escopo: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await tokenGoogle(escopo)}`, "Content-Type": "application/json" }, cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled/i.test(t)) throw new Error("A Google Chat API não está ativa no projeto do Google Cloud.");
    if (/Chat app not found|configure/i.test(t)) throw new Error("Falta configurar o app do Chat no Google Cloud (Google Chat API → Configuração).");
    throw new Error(`Google Chat ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// ---- nomes das pessoas (users/123 → "Fulano") ----
const nomes = new Map<string, { nome: string; email: string; achou: boolean }>();
export async function pessoa(userName: string): Promise<{ nome: string; email: string; achou: boolean }> {
  if (!userName) return { nome: "Contato", email: "", achou: false };
  if (nomes.has(userName)) return nomes.get(userName)!;
  const id = userName.replace("users/", "");
  let out = { nome: "Contato externo", email: "", achou: false };
  try { // 1) People API (diretório do domínio)
    const r = await fetch(`https://people.googleapis.com/v1/people/${id}?personFields=names,emailAddresses`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.diretorio)}` } });
    if (r.ok) { const j = await r.json(); if (j.names?.[0]?.displayName) out = { nome: j.names[0].displayName, email: (j.emailAddresses?.[0]?.value || "").toLowerCase(), achou: true }; }
  } catch { /* tenta o próximo */ }
  if (!out.achou) try { // 2) Admin SDK (usuários do Workspace)
    const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${id}?viewType=domain_public`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.usuarios)}` } });
    if (r.ok) { const j = await r.json(); if (j.name?.fullName) out = { nome: j.name.fullName, email: String(j.primaryEmail || "").toLowerCase(), achou: true }; }
  } catch { /* sem nome */ }
  nomes.set(userName, out);
  return out;
}

// Mensagens antigas gravadas só com o número (109725…): troca pelo nome
async function corrigirNomes(sb: any) {
  const { data } = await sb.from("mensagens").select("autor, conversas!inner(instancia)").eq("conversas.instancia", GCHAT).eq("de_mim", false).limit(2000);
  const ids = Array.from(new Set((data || []).map((m: any) => m.autor).filter((a: string) => /^\d{10,}$/.test(a || ""))));
  for (const id of ids.slice(0, 30)) {
    const p = await pessoa(`users/${id}`);
    if (p.achou) await sb.from("mensagens").update({ autor: p.nome }).eq("autor", id);
  }
  const { data: cs } = await sb.from("conversas").select("id,jid,nome,is_grupo").eq("instancia", GCHAT);
  for (const c of cs || []) {
    if (/^\d{10,}/.test(c.nome || "") || /Contato externo|^users\//.test(c.nome || "")) {
      const nome = await nomeDoEspaco({ name: c.jid }, (await lerConfig() as any).chat_meu_id || null).catch(() => null);
      if (nome && !/^\d{10,}/.test(nome)) await sb.from("conversas").update({ nome }).eq("id", c.id);
    }
  }
}

// Descobre o meu "users/…" (fica guardado na config)
async function meuId(espacos: any[]): Promise<string | null> {
  const cfg: any = await lerConfig();
  if (cfg.chat_meu_id) return cfg.chat_meu_id;
  const eu = minhaConta();
  for (const e of espacos.filter(x => x.spaceType === "DIRECT_MESSAGE").slice(0, 5)) {
    const j = await api(ESCOPOS.chatMembros, `/${e.name}/members?pageSize=10`).catch(() => null);
    for (const m of j?.memberships || []) {
      if (m.member?.type !== "HUMAN") continue;
      const p = await pessoa(m.member.name);
      if (p.email === eu) { await gravarConfig({ chat_meu_id: m.member.name } as any); return m.member.name; }
    }
  }
  return null;
}

async function nomeDoEspaco(e: any, eu: string | null): Promise<string> {
  if (e.displayName) return e.displayName;
  const j = await api(ESCOPOS.chatMembros, `/${e.name}/members?pageSize=10`).catch(() => null);
  const outros = (j?.memberships || []).filter((m: any) => m.member?.type === "HUMAN" && m.member?.name !== eu);
  const ns = await Promise.all(outros.slice(0, 3).map((m: any) => pessoa(m.member.name)));
  return ns.map(n => n.nome).join(", ") || "Conversa do Chat";
}

export async function listarEspacos(): Promise<any[]> {
  const todos: any[] = [];
  let token = "";
  for (let i = 0; i < 5; i++) {
    const j = await api(ESCOPOS.chatEspacos, `/spaces?pageSize=200${token ? `&pageToken=${token}` : ""}`);
    todos.push(...(j.spaces || []));
    token = j.nextPageToken; if (!token) break;
  }
  return todos;
}

async function gravar(sb: any, conv: any, m: any, eu: string | null, historico: boolean) {
  const deMim = !!eu && m.sender?.name === eu;
  const anexo = (m.attachment || [])[0];
  let midia: any = { tipo: "texto", tem_midia: false, midia_mime: null, midia_nome: null, midia_ref: null };
  if (anexo) {
    const mime = anexo.contentType || "application/octet-stream";
    const tipo = mime.startsWith("image/") ? "imagem" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "documento";
    const ref = anexo.attachmentDataRef?.resourceName ? `chat:${anexo.attachmentDataRef.resourceName}`
      : anexo.driveDataRef?.driveFileId ? `drive:${anexo.driveDataRef.driveFileId}` : null;
    midia = { tipo, tem_midia: !!ref, midia_mime: mime, midia_nome: anexo.contentName || "arquivo", midia_ref: ref };
  }
  const marcador = anexo ? (midia.tipo === "imagem" ? "[imagem]" : midia.tipo === "video" ? "[vídeo]" : midia.tipo === "audio" ? "[áudio]" : `[documento: ${midia.midia_nome}]`) : "";
  const texto = [marcador, String(m.text || "").trim()].filter(Boolean).join(" ").trim();
  if (!texto) return false;
  const autor = deMim ? "Maiccon" : (await pessoa(m.sender?.name || "")).nome;
  const meCitou = !deMim && (MEU_NOME.test(texto) || (m.annotations || []).some((a: any) => a.type === "USER_MENTION" && a.userMention?.user?.name === eu));
  const quando = new Date(m.createTime);
  const { data: ins } = await sb.from("mensagens").upsert({
    conversa_id: conv.id, msg_id: m.name, de_mim: deMim, autor, texto: texto.slice(0, 4000), enviada_em: quando.toISOString(),
    me_citou: meCitou, ...midia, citada_texto: m.quotedMessageMetadata ? "[mensagem citada]" : null,
  }, { onConflict: "conversa_id,msg_id", ignoreDuplicates: true }).select("id");
  if (!ins?.length) {
    // já existia: completa anexo e nome (mensagens gravadas antes da v0.10)
    if (anexo) await sb.from("mensagens").update({ ...midia, texto: texto.slice(0, 4000) }).eq("conversa_id", conv.id).eq("msg_id", m.name).is("midia_ref", null);
    return false;
  }
  const upd: any = {};
  if (!historico) {
    upd.nao_lidas = deMim ? 0 : (conv.nao_lidas || 0) + 1; conv.nao_lidas = upd.nao_lidas;
    if (conv.modo === "grupo") { if (meCitou || deMim) upd.pendente_ia = true; } else upd.pendente_ia = true;
  }
  if (!conv.ultima_msg_em || quando >= new Date(conv.ultima_msg_em)) {
    upd.ultima_msg_em = quando.toISOString(); upd.ultima_msg_de_mim = deMim; conv.ultima_msg_em = upd.ultima_msg_em;
    upd.ultima_msg_texto = (deMim ? "Você: " : conv.is_grupo ? autor + ": " : "") + texto.slice(0, 200);
    if (deMim) { upd.precisa_resposta = false; upd.sugestao = null; }
  }
  if (Object.keys(upd).length) await sb.from("conversas").update(upd).eq("id", conv.id);
  if (!historico && !deMim && Date.now() - quando.getTime() < 15 * 60000) {
    const cfg = await lerConfig();
    if ((conv.modo !== "grupo" && cfg.push_whats) || (conv.modo === "grupo" && meCitou && cfg.push_grupo_citado))
      await notificar(`🗨️ ${conv.modo === "grupo" ? conv.nome + " · " + autor : conv.nome}`, texto, `/whatsapp?c=${conv.id}`, `gc-${conv.id}`).catch(() => {});
  }
  return true;
}

// Sincroniza espaços com atividade recente (cron a cada 2 min e botão)
export async function sincronizarChat(opcoes: { diasPrimeira?: number; espaco?: string; historico?: boolean } = {}) {
  const sb = db();
  const espacos = await listarEspacos();
  const eu = await meuId(espacos);
  const limite = Date.now() - (opcoes.diasPrimeira ?? 7) * 86400000;
  const { data: existentes } = await sb.from("conversas").select("*").eq("instancia", GCHAT);
  const porJid = new Map((existentes || []).map((c: any) => [c.jid, c]));
  let novas = 0, mensagens = 0;
  for (const e of espacos) {
    if (opcoes.espaco && e.name !== opcoes.espaco) continue;
    const ativo = e.lastActiveTime ? new Date(e.lastActiveTime).getTime() : 0;
    let conv: any = porJid.get(e.name);
    if (!conv && ativo < limite && !opcoes.espaco) continue;
    if (conv && conv.ultima_msg_em && ativo && ativo <= new Date(conv.ultima_msg_em).getTime() + 1000 && !opcoes.espaco) continue; // nada novo
    if (conv?.modo === "ignorada") continue;
    if (!conv) {
      const isGrupo = e.spaceType !== "DIRECT_MESSAGE";
      const { data } = await sb.from("conversas").upsert({ instancia: GCHAT, jid: e.name, is_grupo: isGrupo, modo: isGrupo ? "grupo" : "auto", nome: await nomeDoEspaco(e, eu) },
        { onConflict: "instancia,jid" }).select("*").single();
      conv = data; novas++;
    }
    const desde = conv.ultima_msg_em && !opcoes.historico ? new Date(new Date(conv.ultima_msg_em).getTime() - 1000).toISOString() : new Date(limite).toISOString();
    const q = new URLSearchParams({ pageSize: "100", orderBy: "createTime asc", filter: `createTime > "${desde}"` });
    const j = await api(ESCOPOS.chatMensagens, `/${e.name}/messages?${q}`).catch(() => null);
    const primeiraVez = !porJid.has(e.name);
    for (const m of j?.messages || []) if (await gravar(sb, conv, m, eu, primeiraVez || !!opcoes.historico)) mensagens++;
  }
  if (!opcoes.espaco) await corrigirNomes(sb).catch(() => {});
  return { espacos: espacos.length, novas, mensagens };
}

export async function enviarChat(espaco: string, texto: string) {
  const j = await api(ESCOPOS.chatMensagens, `/${espaco}/messages`, { method: "POST", body: JSON.stringify({ text: texto }) });
  if (j.sender?.name) { const cfg: any = await lerConfig(); if (!cfg.chat_meu_id) await gravarConfig({ chat_meu_id: j.sender.name } as any); }
  return { id: j.name as string };
}

// Baixa o anexo de uma mensagem do Chat
export async function baixarAnexoChat(ref: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (ref.startsWith("chat:")) {
    const r = await fetch(`${API}/media/${ref.slice(5)}?alt=media`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.chatMensagens)}` } });
    if (!r.ok) return null;
    return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "application/octet-stream" };
  }
  if (ref.startsWith("drive:")) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${ref.slice(6)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.drive)}` } });
    if (!r.ok) return null;
    return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "application/octet-stream" };
  }
  return null;
}
