import { NextRequest, NextResponse } from "next/server";
import { transcreverMensagem } from "@/lib/transcrever";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, texto: await transcreverMensagem(id) }); } catch (e) { return erro(e); }
}
