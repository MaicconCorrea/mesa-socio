import { NextRequest, NextResponse } from "next/server";
import { analisarReuniao } from "@/lib/reunioes";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, ...(await analisarReuniao(id)) }); } catch (e) { return erro(e); }
}
