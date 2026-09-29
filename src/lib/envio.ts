import { marcarLidas } from "./evolution";

// Depois de enviar pelo painel: grava a mensagem e atualiza a conversa
export async function registrarEnvio(sb: any, c: any, m: { msg_id: string; texto: string; tipo: string; mime?: string | null; nome?: string | null; citada_texto?: string | null }) {
  const agora = new Date().toISOString();
  await sb.from("mensagens").upsert({
    conversa_id: c.id, msg_id: m.msg_id, de_mim: true, autor: "Maiccon", texto: m.texto, enviada_em: agora,
    tipo: m.tipo, midia_mime: m.mime || null, midia_nome: m.nome || null, tem_midia: m.tipo !== "texto",
    citada_texto: m.citada_texto || null,
  }, { onConflict: "conversa_id,msg_id", ignoreDuplicates: true });
  await sb.from("conversas").update({
    ultima_msg_em: agora, ultima_msg_de_mim: true, ultima_msg_texto: "Você: " + m.texto.slice(0, 200),
    precisa_resposta: false, nao_lidas: 0, pendente_ia: true, sugestao: null,
    ...(c.modo === "grupo" ? { sem_retorno: false, checar_parado: false } : {}),
  }).eq("id", c.id);
}

// Ao responder, marca como lidas no celular as mensagens do contato que vieram depois da sua última
export async function marcarLidasAoResponder(sb: any, c: any) {
  try {
    const { data } = await sb.from("mensagens").select("msg_id,de_mim,participante").eq("conversa_id", c.id)
      .order("enviada_em", { ascending: false }).limit(30);
    const pendentes: { id: string; participante?: string | null }[] = [];
    for (const m of data || []) { if (m.de_mim) break; pendentes.push({ id: m.msg_id, participante: m.participante }); }
    if (pendentes.length) await marcarLidas(c.instancia, c.jid, pendentes);
  } catch { /* não impede o envio */ }
}
