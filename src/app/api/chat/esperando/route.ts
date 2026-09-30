import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { erro, logado, naoAutorizado } from "@/lib/api";

// Tira a conversa de "esperando você" (a IA errou ou você já resolveu por fora).
// Guarda até quando foi dispensado: a IA só volta a marcar se chegar mensagem NOVA depois disso.
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ erro: "falta o id" }, { status: 400 });
  try {
    const { error } = await db().from("conversas").update({ precisa_resposta: false, sugestao: null, esperando_dispensado_em: new Date().toISOString() }).eq("id", id);
    if (error) {
      if (!/esperando_dispensado_em/.test(error.message)) throw new Error(error.message);
      await db().from("conversas").update({ precisa_resposta: false, sugestao: null }).eq("id", id); // SQL 019 ainda não rodado
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
