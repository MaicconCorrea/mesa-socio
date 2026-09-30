import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { editarMensagem } from "@/lib/evolution";
import { editarMensagemChat } from "@/lib/gchat";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;
const PRAZO_WHATS = 15 * 60 * 1000; // o WhatsApp deixa editar por 15 minutos

// Editar mensagem de texto minha (WhatsApp até 15 min; Google Chat sem prazo)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { mensagemId, texto } = await req.json().catch(() => ({}));
  const novo = String(texto || "").trim();
  if (!novo) return NextResponse.json({ erro: "O texto não pode ficar vazio." }, { status: 400 });
  const sb = db();
  const { data: m } = await sb.from("mensagens").select("id,msg_id,de_mim,enviada_em,conversa_id,tem_midia,apagada").eq("id", mensagemId).maybeSingle();
  if (!m) return NextResponse.json({ erro: "mensagem não encontrada" }, { status: 404 });
  if (!m.de_mim || m.apagada) return NextResponse.json({ erro: "Só dá pra editar as suas mensagens." }, { status: 400 });
  if (m.tem_midia) return NextResponse.json({ erro: "Só mensagens de texto podem ser editadas." }, { status: 400 });
  const { data: c } = await sb.from("conversas").select("instancia,jid").eq("id", m.conversa_id).single();
  try {
    if (c.instancia === "gchat") await editarMensagemChat(m.msg_id, novo);
    else {
      if (Date.now() - new Date(m.enviada_em).getTime() > PRAZO_WHATS) return NextResponse.json({ erro: "O WhatsApp só deixa editar até 15 minutos depois de enviar." }, { status: 400 });
      await editarMensagem(c.instancia, c.jid, m.msg_id, novo);
    }
    await sb.from("mensagens").update({ texto: novo, editada: true }).eq("id", m.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
