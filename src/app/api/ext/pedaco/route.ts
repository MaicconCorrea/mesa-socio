import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transcreverBytes } from "@/lib/transcrever";
import { naoLogado, usuarioDaExtensao } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const u = await usuarioDaExtensao(req); if (!u) return naoLogado();
  const id = req.nextUrl.searchParams.get("id") || "";
  const n = Number(req.nextUrl.searchParams.get("n") || 0);
  const sb = db();
  const { data: r } = await sb.from("reunioes").select("autor_email").eq("id", id).single();
  if (!r || r.autor_email !== u.email) return NextResponse.json({ erro: "reunião não é sua" }, { status: 403 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length < 2000) return NextResponse.json({ ok: true, vazio: true });
  try {
    const texto = await transcreverBytes(bytes, req.headers.get("content-type") || "audio/webm");
    await sb.from("reuniao_pedacos").upsert({ reuniao_id: id, n, texto, erro: null }, { onConflict: "reuniao_id,n" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await sb.from("reuniao_pedacos").upsert({ reuniao_id: id, n, texto: null, erro: String(e?.message ?? e).slice(0, 300) }, { onConflict: "reuniao_id,n" });
    return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 });
  }
}
