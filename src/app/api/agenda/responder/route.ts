import { NextRequest, NextResponse } from "next/server";
import { responderEvento } from "@/lib/agenda";
import { logado, naoAutorizado } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, resposta } = await req.json().catch(() => ({}));
  if (!["accepted", "declined", "tentative"].includes(resposta)) return NextResponse.json({ erro: "resposta" }, { status: 400 });
  try { return NextResponse.json({ ok: true, evento: await responderEvento(id, resposta) }); }
  catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
