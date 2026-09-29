import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

// Zera as não lidas no painel (no celular só marca como lida quando você responde)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  if (id) await db().from("conversas").update({ nao_lidas: 0 }).eq("id", id);
  return NextResponse.json({ ok: true });
}
