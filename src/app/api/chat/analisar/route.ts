import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisarConversa } from "@/lib/analise";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  try {
    await db().from("conversas").update({ analisada_em: null }).eq("id", id);
    const r = await analisarConversa(id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return erro(e); }
}
