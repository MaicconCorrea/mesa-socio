import { NextRequest, NextResponse } from "next/server";
import { enviarResumo } from "@/lib/enviar-resumo";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// Botão "enviar o resumo agora" (teste)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { periodo } = await req.json().catch(() => ({}));
  const r = await enviarResumo(periodo === "tarde" ? "tarde" : "manha");
  return NextResponse.json(r);
}
