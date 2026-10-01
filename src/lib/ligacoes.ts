// Ligações do WhatsApp (evento CALL da Evolution): mostra na conversa "te ligando", "perdida" ou "atendida".
// A Evolution só avisa da ligação — o áudio não passa por ela, então atender/falar continua no celular.
import { gravarMensagem } from "./gravar";
import { notificar } from "./push";
import { lerConfig } from "./config";
import { nomeDoNumero } from "./numeros";

const TEXTO: Record<string, (video: boolean) => string> = {
  offer: v => v ? "🎥 Chamada de vídeo recebida (tocando…)" : "📞 Ligação de voz recebida (tocando…)",
  accept: v => v ? "🎥 Chamada de vídeo atendida" : "📞 Ligação atendida",
  timeout: v => v ? "🎥 Chamada de vídeo perdida" : "📞 Ligação de voz perdida",
  reject: v => v ? "🎥 Chamada de vídeo recusada" : "📞 Ligação recusada",
};

export async function gravarLigacao(sb: any, instancia: string, meuNumero: string, c: any) {
  const id = String(c?.id || ""); const de = String(c?.from || c?.chatId || "");
  const status = String(c?.status || "").toLowerCase();
  if (!id || !de || de.endsWith("@g.us")) return false;
  const video = !!c.isVideo;
  const msgId = `call-${id}`;
  const { data: ja } = await sb.from("mensagens").select("id,texto,conversa_id").eq("msg_id", msgId).maybeSingle();

  // "terminate" sem ter sido atendida = perdida
  let st = status;
  if (st === "terminate") st = ja?.texto?.includes("atendida") ? "" : "timeout";
  const texto = TEXTO[st]?.(video);
  if (!texto) return false;

  if (!ja) {
    const quando = Number(c.date ? new Date(c.date).getTime() / 1000 : Date.now() / 1000);
    return gravarMensagem(sb, instancia, meuNumero, { key: { remoteJid: de, fromMe: false, id: msgId }, message: { conversation: texto }, messageTimestamp: Math.floor(quando), pushName: c.pushName });
  }
  if (ja.texto === texto) return false;
  await sb.from("mensagens").update({ texto }).eq("id", ja.id);
  const { data: conv } = await sb.from("conversas").select("id,nome,modo").eq("id", ja.conversa_id).single();
  if (conv) {
    await sb.from("conversas").update({ ultima_msg_texto: texto, ultima_msg_de_mim: false, pendente_ia: st === "timeout" }).eq("id", conv.id);
    if (st === "timeout" && conv.modo !== "ignorada") {
      try {
        const cfg = await lerConfig();
        if (cfg.push_whats) await notificar(`📞 Ligação perdida · ${conv.nome || "contato"}`, `📱 ${await nomeDoNumero(instancia)} — toque pra ver a conversa`, `/whatsapp?c=${conv.id}`, `call-${conv.id}`);
      } catch { /* aviso nunca atrapalha */ }
    }
  }
  return true;
}
