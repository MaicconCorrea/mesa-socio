import { NextResponse } from "next/server";
import { conexoesDigisac, digisacConfigurado } from "@/lib/digisac";
import { AVISO_DIGISAC, CATEGORIAS } from "@/lib/contatos-comum";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// Opções do "Criar contato": categorias e conexões do Digisac (Atendimento / BPO)
export async function GET() {
  if (!(await logado())) return naoAutorizado();
  if (!digisacConfigurado()) return NextResponse.json({ categorias: CATEGORIAS, digisac: { configurado: false, aviso: AVISO_DIGISAC, conexoes: [] } });
  const c = await conexoesDigisac();
  return NextResponse.json({ categorias: CATEGORIAS, digisac: { configurado: true, erro: c.erro, conexoes: c.lista.map(x => ({ chave: x.chave, nome: x.nome })) } });
}
