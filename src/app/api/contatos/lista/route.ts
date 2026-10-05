import { NextRequest, NextResponse } from "next/server";
import { montarListaContatos } from "@/lib/contatos-destinos";
import { erro, logado, naoAutorizado } from "@/lib/api";
import { donoAtual } from "@/lib/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Números das conversas do WhatsApp cruzados com Mesa, Google Contatos e Digisac
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  if (!donoAtual()) return NextResponse.json({ erro: "Não deu para confirmar quem é você. Entre de novo." }, { status: 401 });
  try { return NextResponse.json(await montarListaContatos(req.nextUrl.searchParams.get("novo") === "1")); }
  catch (e) { return erro(e); }
}
