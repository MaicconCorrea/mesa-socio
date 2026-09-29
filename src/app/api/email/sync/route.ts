import { NextResponse } from "next/server";
import { sincronizarEmail } from "@/lib/email-sync";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300;

export async function POST() {
  if (!(await logado())) return naoAutorizado();
  try { return NextResponse.json({ ok: true, ...(await sincronizarEmail(3)) }); }
  catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
