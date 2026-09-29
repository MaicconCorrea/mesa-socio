import { NextRequest, NextResponse } from "next/server";
import { analisarEmail } from "@/lib/analise";
import { registrarThread } from "@/lib/email-sync";
import { resumoThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { threadId } = await req.json().catch(() => ({}));
  try {
    await registrarThread(await resumoThread(minhaConta(), threadId));
    return NextResponse.json({ ok: true, ...(await analisarEmail(threadId)) });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
