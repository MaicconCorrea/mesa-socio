import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apagarParaTodos } from "@/lib/evolution";
import { apagarMensagemChat } from "@/lib/gchat";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;
const PRAZO_WHATS = 60 * 3600 * 1000; // o WhatsApp deixa apagar para todos por ~60 h

// Apagar para todos: some da Mesa, do seu celular e do celular (ou Chat) da outra pessoa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { mensagemId } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: m } = await sb.from("mensagens").select("id,msg_id,de_mim,enviada_em,conversa_id").eq("id", mensagemId).maybeSingle();
  if (!m) return NextResponse.json({ erro: "mensagem não encontrada" }, { status: 404 });
  if (!m.de_mim) return NextResponse.json({ erro: "Só dá pra apagar as suas mensagens." }, { status: 400 });
  const { data: c } = await sb.from("conversas").select("instancia,jid").eq("id", m.conversa_id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  try {
    if (c.instancia === "gchat") await apagarMensagemChat(m.msg_id);
    else {
      if (Date.now() - new Date(m.enviada_em).getTime() > PRAZO_WHATS) return NextResponse.json({ erro: "Passou o prazo do WhatsApp (cerca de 60 horas) para apagar para todos." }, { status: 400 });
      await apagarParaTodos(c.instancia, c.jid, m.msg_id);
    }
    await sb.from("mensagens").update({ apagada: true }).eq("id", m.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
