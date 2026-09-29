import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarTextoCitando } from "@/lib/evolution";
import { registrarEnvio } from "@/lib/envio";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, texto, citadaId } = await req.json().catch(() => ({}));
  const t = String(texto || "").trim();
  if (!id || !t) return NextResponse.json({ erro: "faltou texto" }, { status: 400 });
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  let citada: any = null;
  if (citadaId) {
    const { data: q } = await sb.from("mensagens").select("msg_id,texto,de_mim").eq("id", citadaId).single();
    if (q) citada = { id: q.msg_id, texto: q.texto, deMim: q.de_mim };
  }
  try {
    const r = await enviarTextoCitando(c.instancia, c.jid, t, citada);
    await registrarEnvio(sb, c, { msg_id: r.id, texto: t, tipo: "texto", citada_texto: citada?.texto || null });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
