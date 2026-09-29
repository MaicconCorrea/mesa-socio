import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, acao } = await req.json().catch(() => ({}));
  const status = acao === "feita" ? "feita" : acao === "descartada" ? "descartada" : null;
  if (!id || !status) return NextResponse.json({ erro: "dados" }, { status: 400 });
  await db().from("tarefas").update({ status, concluida_em: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
