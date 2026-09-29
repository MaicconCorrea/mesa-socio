import { NextRequest, NextResponse } from "next/server";
import { sugerirResposta } from "@/lib/analise";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, instrucao } = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, texto: await sugerirResposta(id, String(instrucao || "")) }); } catch (e) { return erro(e); }
}
