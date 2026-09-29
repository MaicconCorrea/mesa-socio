import { NextRequest, NextResponse } from "next/server";
import { perguntarIA } from "@/lib/analise";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, historico, pergunta } = await req.json().catch(() => ({}));
  try {
    const resposta = await perguntarIA(id, Array.isArray(historico) ? historico : [], String(pergunta || ""));
    return NextResponse.json({ resposta });
  } catch (e) { return erro(e); }
}
