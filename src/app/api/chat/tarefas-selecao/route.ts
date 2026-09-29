import { NextRequest, NextResponse } from "next/server";
import { tarefasDaSelecao } from "@/lib/analise";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ erro: "selecione mensagens" }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await tarefasDaSelecao(id, ids)) }); } catch (e) { return erro(e); }
}
