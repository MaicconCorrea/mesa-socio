import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marcarLidas } from "@/lib/evolution";
import { logado, naoAutorizado } from "@/lib/api";

// Zera as não lidas no painel e (se ligado) marca como lida no celular
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, noCelular } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false });
  const sb = db();
  const { data: c } = await sb.from("conversas").select("id,instancia,jid,nao_lidas").eq("id", id).single();
  if (!c) return NextResponse.json({ ok: false });
  if (noCelular && c.nao_lidas > 0) {
    const { data: ult } = await sb.from("mensagens").select("msg_id,participante").eq("conversa_id", id).eq("de_mim", false)
      .order("enviada_em", { ascending: false }).limit(Math.min(c.nao_lidas, 30));
    try { await marcarLidas(c.instancia, c.jid, (ult || []).map((m: any) => ({ id: m.msg_id, participante: m.participante }))); } catch { /* segue */ }
  }
  await sb.from("conversas").update({ nao_lidas: 0 }).eq("id", id);
  return NextResponse.json({ ok: true });
}
