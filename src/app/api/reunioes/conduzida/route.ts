import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisarReuniao } from "@/lib/reunioes";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

// Informa quem conduziu/falou na reunião (a gravação não sabe de quem é a voz) e reanalisa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, conduzida_por } = await req.json().catch(() => ({}));
  try {
    const { error } = await db().from("reunioes").update({ conduzida_por: String(conduzida_por || "").trim() || null }).eq("id", id);
    if (error) throw new Error(/conduzida_por/.test(error.message) ? "Falta rodar o SQL 018 no Supabase." : error.message);
    return NextResponse.json({ ok: true, ...(await analisarReuniao(id)) });
  } catch (e) { return erro(e); }
}
