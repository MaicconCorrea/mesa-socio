import { NextRequest, NextResponse } from "next/server";
import { apagarEvento } from "@/lib/agenda";
import { logado, naoAutorizado } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  try { await apagarEvento(id); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
