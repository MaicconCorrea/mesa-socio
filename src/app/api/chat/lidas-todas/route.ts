import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

// Zera as não lidas no painel (no celular continua como está — lá só marca ao responder)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { ids } = await req.json().catch(() => ({}));
  let q = db().from("conversas").update({ nao_lidas: 0 }).gt("nao_lidas", 0);
  if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
