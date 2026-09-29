// Grava uma mensagem da Evolution no banco (usado pelo webhook e pela importação de histórico)
import { contexto, extrairTexto, infoMidia, nomeDoGrupo, soNumero } from "./evolution";
import { numeroDoJid } from "./fmt";
import { lerConfig } from "./config";
import { notificar } from "./push";

const MEU_NOME = /\bmai+c+o+[nm]\b/i; // Maiccon, Maicon, Maicom...

export function paraData(ts: any): Date {
  let n = ts;
  if (ts && typeof ts === "object" && "low" in ts) n = ts.low;
  n = Number(n);
  if (!n || isNaN(n)) return new Date();
  return new Date(n < 1e12 ? n * 1000 : n);
}

function textoCitado(m: any): string | null {
  const achar = (o: any): any => {
    if (!o || typeof o !== "object") return null;
    if (o.contextInfo?.quotedMessage) return o.contextInfo.quotedMessage;
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === "object") { const r = achar(v); if (r) return r; } }
    return null;
  };
  const q = achar(m);
  return q ? (extrairTexto(q) || "[mídia]") : null;
}

export function jidDaMensagem(key: any): string | null {
  if (!key?.remoteJid) return null;
  let jid: string = key.remoteJid;
  if (jid.endsWith("@lid") && key.remoteJidAlt) jid = key.remoteJidAlt;
  if (jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return null;
  return jid;
}

export async function gravarMensagem(sb: any, instancia: string, meuNumero: string, m: any, opcoes: { historico?: boolean } = {}) {
  const key = m?.key;
  const jid = jidDaMensagem(key);
  if (!jid || !key?.id) return false;

  const texto = extrairTexto(m.message);
  if (!texto) return false;

  const midia = infoMidia(m.message);
  const isGrupo = jid.endsWith("@g.us");
  const deMim = !!key.fromMe;
  const quando = paraData(m.messageTimestamp);
  const autor = deMim ? "Maiccon" : (m.pushName || numeroDoJid(key.participant || jid));

  const ctx = contexto(m.message, m);
  const meCitou = !deMim && (
    (!!meuNumero && ctx.mencionados.some((j) => soNumero(j) === meuNumero)) ||
    (!!meuNumero && soNumero(ctx.respondeuA) === meuNumero) ||
    MEU_NOME.test(texto)
  );

  let { data: conv } = await sb.from("conversas").select("id,nome,modo,ultima_msg_em,nao_lidas")
    .eq("instancia", instancia).eq("jid", jid).maybeSingle();
  if (!conv) {
    let nome: string | null = null;
    if (isGrupo) nome = await nomeDoGrupo(instancia, jid);
    else if (!deMim && m.pushName) nome = m.pushName;
    const { data: nova } = await sb.from("conversas").upsert({
      instancia, jid, is_grupo: isGrupo, nome: nome || numeroDoJid(jid), modo: isGrupo ? "grupo" : "auto",
    }, { onConflict: "instancia,jid" }).select("id,nome,modo,ultima_msg_em,nao_lidas").single();
    conv = nova;
  } else if (!isGrupo && !deMim && m.pushName && conv.nome === numeroDoJid(jid)) {
    await sb.from("conversas").update({ nome: m.pushName }).eq("id", conv.id);
  }
  if (!conv || conv.modo === "ignorada") return false;

  const { data: ins, error } = await sb.from("mensagens").upsert({
    conversa_id: conv.id, msg_id: key.id, de_mim: deMim, autor, texto: texto.slice(0, 4000),
    enviada_em: quando.toISOString(), me_citou: meCitou,
    tipo: midia.tipo, midia_mime: midia.mime, midia_nome: midia.nome, tem_midia: midia.tipo !== "texto",
    participante: key.participant || null, citada_texto: textoCitado(m.message),
  }, { onConflict: "conversa_id,msg_id", ignoreDuplicates: true }).select("id");
  if (error || !ins?.length) return false; // já existia

  const maisNova = !conv.ultima_msg_em || quando.getTime() >= new Date(conv.ultima_msg_em).getTime();
  const upd: any = {};
  if (!opcoes.historico) {
    upd.nao_lidas = deMim ? 0 : (conv.nao_lidas || 0) + 1;
    if (conv.modo === "grupo") {
      if (meCitou || deMim) upd.pendente_ia = true;
      upd.sem_retorno = false;
      upd.checar_parado = !deMim;
    } else {
      upd.pendente_ia = true;
    }
  }
  if (maisNova) {
    upd.ultima_msg_em = quando.toISOString();
    upd.ultima_msg_de_mim = deMim;
    upd.ultima_msg_texto = (deMim ? "Você: " : (isGrupo ? autor + ": " : "")) + texto.slice(0, 200);
    if (deMim) upd.precisa_resposta = false;
  }
  if (Object.keys(upd).length) await sb.from("conversas").update(upd).eq("id", conv.id);

  // 🔔 aviso no celular (só mensagem nova de verdade, não histórico)
  if (!opcoes.historico && !deMim && Date.now() - quando.getTime() < 10 * 60000) {
    try {
      const cfg = await lerConfig();
      const cx = "📱" + instancia.replace(/^socio-/, "");
      const corpo = texto.replace(/^\[(imagem|vídeo|áudio)\]\s*/, (m0) => m0.includes("áudio") ? "🎤 áudio " : m0.includes("imagem") ? "📷 foto " : "🎥 vídeo ");
      if (conv.modo !== "grupo" && cfg.push_whats)
        await notificar(`${conv.nome || autor} · ${cx}`, corpo, `/whatsapp?c=${conv.id}`, `wa-${conv.id}`);
      else if (conv.modo === "grupo" && meCitou && cfg.push_grupo_citado)
        await notificar(`📣 ${conv.nome || "Grupo"} · ${cx}`, `${autor}: ${corpo}`, `/whatsapp?c=${conv.id}`, `wa-${conv.id}`);
    } catch { /* aviso nunca atrapalha gravar */ }
  }
  return true;
}
