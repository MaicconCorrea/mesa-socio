import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { erro, logado, naoAutorizado } from "@/lib/api";

// Fixa / desafixa a conversa no topo da lista (igual o 📌 do WhatsApp)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, fixar } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ erro: "falta o id" }, { status: 400 });
  try {
    const { error } = await db().from("conversas").update({ fixada_em: fixar ? new Date().toISOString() : null }).eq("id", id);
    if (error) throw new Error(/fixada_em/.test(error.message) ? "Falta rodar o SQL 020 no Supabase." : error.message);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
