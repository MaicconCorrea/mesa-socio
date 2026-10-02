// Lida no celular → some o contador na Mesa.
// A Evolution avisa por dois eventos: messages.update (status READ de mensagem que não é minha = li em outro aparelho)
// e chats.update (unreadCount 0). Os dois zeram nao_lidas da conversa.
async function acharConversa(sb: any, instancia: string, jid: string) {
  if (!jid) return null;
  const { data } = await sb.from("conversas").select("id,nao_lidas").eq("instancia", instancia)
    .or(jid.endsWith("@lid") ? `jid.eq.${jid},lid.eq.${jid}` : `jid.eq.${jid}`).limit(1);
  return data?.[0] || null;
}

export async function lidasNoCelular(sb: any, instancia: string, evento: string, data: any) {
  const itens: any[] = Array.isArray(data) ? data : [data];
  const jids = new Set<string>();
  for (const d of itens) {
    if (!d) continue;
    if (evento.includes("messages.update")) {
      const k = d.key || d;
      const st = String(d.status ?? d.update?.status ?? "").toUpperCase();
      const leu = st === "READ" || st === "PLAYED" || st === "4" || st === "5";
      if (leu && k.fromMe === false) jids.add(String(k.remoteJid || d.remoteJid || ""));
    } else if (evento.includes("chats.update")) {
      const n = d.unreadCount ?? d.unreadMessages ?? d.unread;
      if (n === 0 || n === "0") jids.add(String(d.remoteJid || d.id || ""));
    }
  }
  let zeradas = 0;
  for (const jid of jids) {
    const c = await acharConversa(sb, instancia, jid);
    if (c && c.nao_lidas > 0) { await sb.from("conversas").update({ nao_lidas: 0 }).eq("id", c.id); zeradas++; }
  }
  return zeradas;
}
