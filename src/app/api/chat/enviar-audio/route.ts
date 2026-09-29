import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarAudio } from "@/lib/evolution";
import { registrarEnvio } from "@/lib/envio";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, base64 } = await req.json().catch(() => ({}));
  if (!id || !base64) return NextResponse.json({ erro: "faltou o áudio" }, { status: 400 });
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  try {
    const r = await enviarAudio(c.instancia, c.jid, base64);
    await registrarEnvio(sb, c, { msg_id: r.id, texto: "[áudio]", tipo: "audio", mime: "audio/ogg" });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
