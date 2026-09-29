import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { baixarMidia } from "@/lib/evolution";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Foto, áudio, vídeo ou documento de uma mensagem (busca na Evolution na hora)
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id");
  const baixar = req.nextUrl.searchParams.get("baixar") === "1";
  const sb = db();
  const { data: m } = await sb.from("mensagens").select("msg_id,midia_nome,midia_mime,conversa_id").eq("id", id).single();
  if (!m) return new NextResponse("não encontrado", { status: 404 });
  const { data: c } = await sb.from("conversas").select("instancia").eq("id", m.conversa_id).single();
  const arq = await baixarMidia(c?.instancia || "", m.msg_id);
  if (!arq) return new NextResponse("arquivo indisponível na Evolution", { status: 404 });
  const nome = m.midia_nome || arq.nome || "arquivo";
  return new NextResponse(new Uint8Array(arq.bytes), {
    headers: {
      "Content-Type": m.midia_mime || arq.mime,
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
