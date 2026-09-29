import { NextResponse } from "next/server";
import { notificar } from "@/lib/push";
import { logado, naoAutorizado } from "@/lib/api";

export async function POST() {
  if (!(await logado())) return naoAutorizado();
  try { const r = await notificar("🔔 Mesa do Sócio", "Teste: se você está vendo isso, os avisos estão funcionando.", "/", "teste", "teste"); return NextResponse.json(r); }
  catch (e: any) { return NextResponse.json({ erro: e.message }, { status: 500 }); }
}
