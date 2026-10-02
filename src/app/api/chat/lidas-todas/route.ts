import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado, erro } from "@/lib/api";
import { marcarLidas } from "@/lib/evolution";

export const maxDuration = 60;

// "Marcar todas como lidas" → na Mesa E no celular
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ ok: true });
  try {
    const sb = db();
    const { data: conversas } = await sb.from("conversas").select("id,jid,instancia,nao_lidas").in("id", ids).gt("nao_lidas", 0);
    await sb.from("conversas").update({ nao_lidas: 0 }).in("id", ids);
    for (const c of conversas || []) {
      if (c.instancia === "gchat") continue;
      const { data: msgs } = await sb.from("mensagens").select("msg_id,participante").eq("conversa_id", c.id).eq("de_mim", false)
        .not("msg_id", "like", "call-%").order("enviada_em", { ascending: false }).limit(Math.min(c.nao_lidas, 50));
      if (msgs?.length) await marcarLidas(c.instancia, c.jid, msgs.map((m: any) => ({ id: m.msg_id, participante: m.participante }))).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
