import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarArquivo } from "@/lib/evolution";
import { enviarArquivoChat } from "@/lib/gchat";
import { marcarLidasAoResponder, registrarEnvio } from "@/lib/envio";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, base64, mime, nome, legenda } = await req.json().catch(() => ({}));
  if (!id || !base64) return NextResponse.json({ erro: "faltou o arquivo" }, { status: 400 });
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  try {
    if (c.instancia === "gchat") {
      const r = await enviarArquivoChat(c.jid, { bytes: Buffer.from(base64, "base64"), mime: mime || "application/octet-stream", nome: nome || "arquivo", legenda });
      const tipo = (mime || "").startsWith("image/") ? "imagem" : (mime || "").startsWith("video/") ? "video" : "documento";
      const marcador = tipo === "imagem" ? "[imagem]" : tipo === "video" ? "[vídeo]" : `[documento: ${nome}]`;
      await registrarEnvio(sb, c, { msg_id: r.id, texto: `${marcador} ${legenda || ""}`.trim(), tipo, mime, nome, midia_ref: r.ref });
      return NextResponse.json({ ok: true });
    }
    await marcarLidasAoResponder(sb, c);
    const r = await enviarArquivo(c.instancia, c.jid, { base64, mime: mime || "application/octet-stream", nome: nome || "arquivo", legenda });
    const tipo = r.tipo === "image" ? "imagem" : r.tipo === "video" ? "video" : r.tipo === "audio" ? "audio" : "documento";
    const marcador = tipo === "imagem" ? "[imagem]" : tipo === "video" ? "[vídeo]" : tipo === "audio" ? "[áudio]" : `[documento: ${nome}]`;
    await registrarEnvio(sb, c, { msg_id: r.id, texto: `${marcador} ${legenda || ""}`.trim(), tipo, mime, nome });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
