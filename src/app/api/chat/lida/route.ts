import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado, erro } from "@/lib/api";
import { marcarLidas } from "@/lib/evolution";

// Abriu a conversa na Mesa → marca como lida aqui E no celular (tracinhos azuis pro cliente)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: true });
  try {
    const sb = db();
    const { data: c } = await sb.from("conversas").select("id,jid,instancia,nao_lidas").eq("id", id).single();
    if (!c || !c.nao_lidas) return NextResponse.json({ ok: true });
    await sb.from("conversas").update({ nao_lidas: 0 }).eq("id", id);
    if (c.instancia !== "gchat") {
      // as últimas mensagens que não são minhas (quantas estavam por ler)
      const { data: msgs } = await sb.from("mensagens").select("msg_id,participante").eq("conversa_id", id).eq("de_mim", false)
        .not("msg_id", "like", "call-%").order("enviada_em", { ascending: false }).limit(Math.min(Math.max(c.nao_lidas, 1), 50));
      if (msgs?.length) await marcarLidas(c.instancia, c.jid, msgs.map((m: any) => ({ id: m.msg_id, participante: m.participante }))).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
