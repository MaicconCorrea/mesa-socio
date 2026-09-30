// Google Chat do Maiccon (pela conta de serviço com delegação no domínio).
// Cada espaço/conversa do Chat vira uma "conversa" da Mesa com instancia = "gchat" — assim IA, sugestões,
// tarefas, avisos e "esperando resposta" funcionam igual ao WhatsApp.
import { db } from "./db";
import { socioAtual } from "./socios";
import { ESCOPOS, contaAdmin, minhaConta, tokenGoogle } from "./google";
import { donoAtual } from "./contexto";
import { lerConfig, gravarConfig } from "./config";
import { notificar } from "./push";

const API = "https://chat.googleapis.com/v1";
export const GCHAT = "gchat";
// Nome do sócio da vez (Maiccon, Marcos…) — marcação por nome no texto
function regexDoNome(primeiro: string) {
  if (/^mai+c+o+[nm]$/i.test(primeiro)) return /\bmai+c+o+[nm]\b/i;
  return new RegExp(`\\b${primeiro.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "")}\\b`, "i");
}

async function api(escopo: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await tokenGoogle(escopo)}`, "Content-Type": "application/json" }, cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled/i.test(t)) throw new Error("A Google Chat API não está ativa no projeto do Google Cloud.");
    if (/Chat app not found|configure/i.test(t)) throw new Error("Falta configurar o app do Chat no Google Cloud (Google Chat API → Configuração).");
    throw new Error(`Google Chat ${r.status}: ${t.slice(0, 200)}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : {};
}

// ---- nomes das pessoas (users/123 → "Fulano") ----
const nomes = new Map<string, { nome: string; email: string; achou: boolean }>();
export let ultimoErroNome = "";
export async function pessoa(userName: string): Promise<{ nome: string; email: string; achou: boolean }> {
  if (!userName) return { nome: "Contato", email: "", achou: false };
  if (nomes.has(userName)) return nomes.get(userName)!;
  const id = userName.replace("users/", "");
  let out = { nome: "Contato externo", email: "", achou: false };
  try { // 1) Admin SDK (usuários do Workspace da Outtax)
    const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${id}?projection=basic`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.usuarios, contaAdmin())}` } });
    if (r.ok) { const j = await r.json(); if (j.name?.fullName) out = { nome: j.name.fullName, email: String(j.primaryEmail || "").toLowerCase(), achou: true }; }
    else ultimoErroNome = `Admin SDK ${r.status}: ${(await r.text()).slice(0, 160)}`;
  } catch (e: any) { ultimoErroNome = String(e?.message ?? e); }
  if (!out.achou) try { // 2) People API (diretório)
    const r = await fetch(`https://people.googleapis.com/v1/people/${id}?personFields=names,emailAddresses&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.diretorio, contaAdmin())}` } });
    if (r.ok) { const j = await r.json(); if (j.names?.[0]?.displayName) out = { nome: j.names[0].displayName, email: (j.emailAddresses?.[0]?.value || "").toLowerCase(), achou: true }; }
    else if (!ultimoErroNome) ultimoErroNome = `People ${r.status}: ${(await r.text()).slice(0, 160)}`;
  } catch { /* sem nome */ }
  if (out.achou) nomes.set(userName, out); // só guarda quando achou (pra tentar de novo depois)
  return out;
}

// Mensagens antigas gravadas só com o número (109725…): troca pelo nome
async function corrigirNomes(sb: any) {
  const { data } = await sb.from("mensagens").select("autor, conversas!inner(instancia,dono)").eq("conversas.instancia", GCHAT).eq("conversas.dono", donoAtual() || "-").eq("de_mim", false).limit(2000);
  const ids = Array.from(new Set((data || []).map((m: any) => m.autor).filter((a: string) => /^\d{10,}$/.test(a || ""))));
  for (const id of ids.slice(0, 30)) {
    const p = await pessoa(`users/${id}`);
    if (p.achou) await sb.from("mensagens").update({ autor: p.nome }).eq("autor", id);
  }
  const { data: cs } = await sb.from("conversas").select("id,jid,nome,is_grupo").eq("instancia", GCHAT);
  for (const c of cs || []) {
    if (/^\d{10,}/.test(c.nome || "") || /Contato externo|^users\/|, Contato/.test(c.nome || "")) {
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
  try { // o id do Chat é o mesmo id do usuário no Workspace
    const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(eu)}?projection=basic`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.usuarios, contaAdmin())}` } });
    if (r.ok) { const j = await r.json(); if (j.id) { await gravarConfig({ chat_meu_id: `users/${j.id}` } as any); return `users/${j.id}`; } }
  } catch { /* tenta pelos membros */ }
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
  const ns = await Promise.all(outros.slice(0, 3).map(async (m: any) => m.member?.displayName ? { nome: m.member.displayName } : pessoa(m.member.name)));
  const bons = ns.map(n => n.nome).filter(n => n && !/^Contato externo$/.test(n));
  return bons.join(", ") || "Conversa do Chat";
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
  const citada = m.quotedMessageMetadata?.name ? await textoCitado(sb, m.quotedMessageMetadata.name) : null;
  // marcações chegam como <users/123> → mostra @Nome
  let corpo = String(m.text || "").trim().replace(/<users\/all>/g, "@todos");
  for (const u of Array.from(new Set(corpo.match(/<users\/\d+>/g) || []))) corpo = corpo.split(u).join("@" + (await pessoa(u.slice(1, -1))).nome);
  const texto = [marcador, corpo].filter(Boolean).join(" ").trim();
  if (!texto) return false;
  const nomeDaMsg = String(m.sender?.displayName || "").trim();
  if (nomeDaMsg && m.sender?.name && !nomes.has(m.sender.name)) nomes.set(m.sender.name, { nome: nomeDaMsg, email: "", achou: true });
  const autor = deMim ? (await socioAtual()).primeiro : (nomeDaMsg || (await pessoa(m.sender?.name || "")).nome);
  const MEU_NOME = regexDoNome((await socioAtual()).primeiro);
  const meCitou = !deMim && (MEU_NOME.test(texto) || (m.annotations || []).some((a: any) => a.type === "USER_MENTION" && a.userMention?.user?.name === eu));
  const quando = new Date(m.createTime);
  const { data: ins } = await sb.from("mensagens").upsert({
    conversa_id: conv.id, msg_id: m.name, de_mim: deMim, autor, texto: texto.slice(0, 4000), enviada_em: quando.toISOString(),
    me_citou: meCitou, ...midia, citada_texto: citada, participante: m.sender?.name || null,
  }, { onConflict: "conversa_id,msg_id", ignoreDuplicates: true }).select("id");
  if (!ins?.length) {
    // já existia (gravada antes): acerta nome de quem mandou e o anexo
    const upd: any = { participante: m.sender?.name || null, ...(citada ? { citada_texto: citada } : {}) };
    const foiEditada = m.lastUpdateTime && m.createTime && new Date(m.lastUpdateTime).getTime() - new Date(m.createTime).getTime() > 2000;
    if (foiEditada && !anexo && texto) { upd.texto = texto.slice(0, 4000); upd.editada = true; }
    if (!deMim && !/^Contato/.test(autor)) upd.autor = autor;
    if (anexo && midia.midia_ref) Object.assign(upd, midia, { texto: texto.slice(0, 4000) });
    if (Object.keys(upd).length) await sb.from("mensagens").update(upd).eq("conversa_id", conv.id).eq("msg_id", m.name);
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
export async function sincronizarChat(opcoes: { diasPrimeira?: number; espaco?: string; historico?: boolean; forcar?: boolean } = {}) {
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
    if (!opcoes.forcar && conv && conv.ultima_msg_em && ativo && ativo <= new Date(conv.ultima_msg_em).getTime() + 1000 && !opcoes.espaco) continue; // nada novo
    if (opcoes.forcar && ativo && ativo < limite && conv) continue;
    if (conv?.modo === "ignorada") continue;
    if (!conv) {
      const isGrupo = e.spaceType !== "DIRECT_MESSAGE";
      const { data } = await sb.from("conversas").upsert({ instancia: GCHAT, jid: e.name, is_grupo: isGrupo, modo: isGrupo ? "grupo" : "auto", nome: await nomeDoEspaco(e, eu) },
        { onConflict: "dono,instancia,jid" }).select("*").single();
      conv = data; novas++;
    }
    const desde = conv.ultima_msg_em && !opcoes.historico && !opcoes.forcar ? new Date(new Date(conv.ultima_msg_em).getTime() - 1000).toISOString() : new Date(limite).toISOString();
    const q = new URLSearchParams({ pageSize: "100", orderBy: "createTime asc", filter: `createTime > "${desde}"` });
    const j = await api(ESCOPOS.chatMensagens, `/${e.name}/messages?${q}`).catch(() => null);
    const primeiraVez = !porJid.has(e.name);
    for (const m of j?.messages || []) if (await gravar(sb, conv, m, eu, primeiraVez || !!opcoes.historico || !!opcoes.forcar)) mensagens++;
  }
  if (!opcoes.espaco) await corrigirNomes(sb).catch(() => {});
  await nomesDasDiretas(sb, eu).catch(() => {});
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

// Conversa direta: título = nome da outra pessoa; foto = foto dela no Workspace
async function nomesDasDiretas(sb: any, eu: string | null) {
  const { data: cs } = await sb.from("conversas").select("id,nome,foto_url").eq("instancia", GCHAT).eq("is_grupo", false);
  for (const c of cs || []) {
    const ruim = !c.nome || /^\d{6,}|Contato externo|Conversa do Chat|Conversa direta/.test(c.nome);
    if (!ruim && c.foto_url) continue;
    const { data: ms } = await sb.from("mensagens").select("autor,participante").eq("conversa_id", c.id).eq("de_mim", false)
      .not("participante", "is", null).order("enviada_em", { ascending: false }).limit(20);
    const m = (ms || []).find((x: any) => x.participante && x.participante !== eu && x.autor && !/^Contato|^\d{6,}/.test(x.autor)) || (ms || [])[0];
    if (!m) continue;
    const upd: any = {};
    if (ruim && m.autor && !/^Contato|^\d{6,}/.test(m.autor)) upd.nome = m.autor;
    if (!c.foto_url && m.participante) upd.foto_url = `/api/chat/foto?u=${encodeURIComponent(m.participante)}`;
    if (Object.keys(upd).length) await sb.from("conversas").update(upd).eq("id", c.id);
  }
}

// Foto de um usuário do Workspace (Admin SDK)
export async function fotoUsuario(userName: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const id = userName.replace("users/", "");
  const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${id}/photos/thumbnail`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.usuarios, contaAdmin())}` } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.photoData) return null;
  return { bytes: Buffer.from(String(j.photoData).replace(/-/g, "+").replace(/_/g, "/").replace(/\*/g, "=").replace(/\./g, "="), "base64"), mime: j.mimeType || "image/jpeg" };
}

// Enviar arquivo (foto, PDF…) no Google Chat: sobe o anexo e cria a mensagem com ele
export async function enviarArquivoChat(espaco: string, a: { bytes: Buffer; mime: string; nome: string; legenda?: string }) {
  const token = await tokenGoogle(ESCOPOS.chatMensagens);
  const fronteira = "mesa" + Math.random().toString(36).slice(2);
  const corpo = Buffer.concat([
    Buffer.from(`--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ filename: a.nome })}\r\n--${fronteira}\r\nContent-Type: ${a.mime}\r\n\r\n`),
    a.bytes,
    Buffer.from(`\r\n--${fronteira}--`),
  ]);
  const up = await fetch(`https://chat.googleapis.com/upload/v1/${espaco}/attachments:upload?uploadType=multipart`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${fronteira}` }, body: corpo,
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || !uj.attachmentDataRef) throw new Error(`Google Chat não aceitou o arquivo (${up.status}): ${JSON.stringify(uj).slice(0, 160)}`);
  const j = await api(ESCOPOS.chatMensagens, `/${espaco}/messages`, {
    method: "POST", body: JSON.stringify({ ...(a.legenda ? { text: a.legenda } : {}), attachment: [{ attachmentDataRef: uj.attachmentDataRef }] }),
  });
  const anexo = j.attachment?.[0];
  return { id: j.name as string, ref: anexo?.attachmentDataRef?.resourceName ? `chat:${anexo.attachmentDataRef.resourceName}` : null };
}

// Apagar mensagem minha no Google Chat (some para todos)
export async function apagarMensagemChat(nomeMensagem: string) {
  await api(ESCOPOS.chatMensagens, `/${nomeMensagem}`, { method: "DELETE" });
}

// Participantes de um espaço do Google Chat (para marcar com @)
export async function participantesChat(espaco: string): Promise<{ id: string; nome: string }[]> {
  const out: { id: string; nome: string }[] = []; let pg = "";
  for (let i = 0; i < 3; i++) {
    const j = await api(ESCOPOS.chatMembros, `/${espaco}/members?pageSize=100${pg ? `&pageToken=${pg}` : ""}`).catch(() => null);
    for (const m of j?.memberships || []) {
      if (m.member?.type !== "HUMAN" || !m.member?.name) continue;
      out.push({ id: m.member.name, nome: m.member.displayName || (await pessoa(m.member.name)).nome });
    }
    pg = j?.nextPageToken; if (!pg) break;
  }
  return out;
}

// Mensagem citada: "Autor: texto" — procura no banco; se não tiver, busca no Google Chat
const citadas = new Map<string, string>();
async function textoCitado(sb: any, nome: string): Promise<string> {
  if (citadas.has(nome)) return citadas.get(nome)!;
  let out = "";
  const { data } = await sb.from("mensagens").select("autor,texto,de_mim").eq("msg_id", nome).limit(1);
  if (data?.[0]) out = `${data[0].de_mim ? "Você" : data[0].autor || "Contato"}: ${data[0].texto || ""}`;
  else {
    try {
      const j = await api(ESCOPOS.chatMensagens, `/${nome}`);
      let corpo = String(j.text || (j.attachment?.length ? `[anexo: ${j.attachment[0].contentName || "arquivo"}]` : "")).trim();
      for (const u of Array.from(new Set(corpo.match(/<users\/\d+>/g) || []))) corpo = corpo.split(u).join("@" + (await pessoa(u.slice(1, -1))).nome);
      const quem = j.sender?.displayName || (j.sender?.name ? (await pessoa(j.sender.name)).nome : "Contato");
      out = `${quem}: ${corpo}`;
    } catch { out = "[mensagem citada — não encontrada]"; }
  }
  out = out.slice(0, 300);
  citadas.set(nome, out);
  return out;
}

// Editar mensagem minha no Google Chat
export async function editarMensagemChat(nomeMensagem: string, texto: string) {
  await api(ESCOPOS.chatMensagens, `/${nomeMensagem}?updateMask=text`, { method: "PATCH", body: JSON.stringify({ text: texto }) });
}
