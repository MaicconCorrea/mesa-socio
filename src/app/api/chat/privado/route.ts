import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { telefoneDoParticipante } from "@/lib/evolution";
import { numeroDoJid } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;

// "Responder no privado": acha o número de quem escreveu no grupo e abre (ou cria) a conversa individual
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { mensagemId } = await req.json().catch(() => ({}));
  const sb = db();
  try {
    const { data: m } = await sb.from("mensagens").select("participante,autor,conversa_id,de_mim").eq("id", mensagemId).single();
    if (!m || m.de_mim) return NextResponse.json({ erro: "mensagem não encontrada" }, { status: 404 });
    const { data: g } = await sb.from("conversas").select("instancia,jid,is_grupo").eq("id", m.conversa_id).single();
    if (!g?.is_grupo || g.instancia === "gchat") return NextResponse.json({ erro: "só para grupos de WhatsApp" }, { status: 400 });
    if (!m.participante) return NextResponse.json({ erro: "não sei quem mandou esta mensagem (mensagem antiga sem o participante)" }, { status: 400 });

    // LID já conhecido de outra conversa? senão pergunta pro grupo na Evolution
    let jid: string | null = m.participante.endsWith("@s.whatsapp.net") ? m.participante : null;
    if (!jid && m.participante.endsWith("@lid")) {
      const { data: x } = await sb.from("conversas").select("jid").eq("instancia", g.instancia).eq("lid", m.participante).limit(1);
      jid = x?.[0]?.jid || null;
    }
    if (!jid) jid = await telefoneDoParticipante(g.instancia, g.jid, m.participante);
    if (!jid) return NextResponse.json({ erro: "o WhatsApp não informou o número desta pessoa (privacidade do grupo). Use + Nova conversa com o número." }, { status: 400 });

    const { data: ja } = await sb.from("conversas").select("id").eq("instancia", g.instancia).eq("jid", jid).maybeSingle();
    if (ja) return NextResponse.json({ ok: true, id: ja.id });
    const nome = m.autor && !/^\+?\d[\d\s]*$/.test(m.autor) ? m.autor : numeroDoJid(jid);
    const { data: nova, error } = await sb.from("conversas").insert({ instancia: g.instancia, jid, is_grupo: false, modo: "auto", nome }).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: nova.id, nova: true });
  } catch (e) { return erro(e); }
}
