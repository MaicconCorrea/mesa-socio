import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transcreverBytes } from "@/lib/transcrever";
import { extensaoAutorizada, semChave } from "@/lib/gravador";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Recebe um pedaço do áudio (até ~5 min) e já transcreve
export async function POST(req: NextRequest) {
  if (!(await extensaoAutorizada(req))) return semChave();
  const id = req.nextUrl.searchParams.get("id") || "";
  const n = Number(req.nextUrl.searchParams.get("n") || 0);
  const mime = req.headers.get("content-type") || "audio/webm";
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length < 2000) return NextResponse.json({ ok: true, vazio: true });
  const sb = db();
  try {
    const texto = await transcreverBytes(bytes, mime);
    await sb.from("reuniao_pedacos").upsert({ reuniao_id: id, n, texto, erro: null }, { onConflict: "reuniao_id,n" });
    return NextResponse.json({ ok: true, caracteres: texto.length });
  } catch (e: any) {
    await sb.from("reuniao_pedacos").upsert({ reuniao_id: id, n, texto: null, erro: String(e?.message ?? e).slice(0, 300) }, { onConflict: "reuniao_id,n" });
    return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 });
  }
}
