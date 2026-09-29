import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { textoDoDoc } from "@/lib/drive";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// Transcrição / anotações completas da reunião
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  const sb = db();
  const { data: r } = await sb.from("reunioes").select("texto,doc_id").eq("id", id).single();
  if (!r) return NextResponse.json({ erro: "não encontrada" }, { status: 404 });
  try {
    let texto = r.texto;
    if (!texto && r.doc_id) { texto = await textoDoDoc(r.doc_id); await sb.from("reunioes").update({ texto }).eq("id", id); }
    const { data: ps } = await sb.from("reuniao_pedacos").select("n,erro").eq("reuniao_id", id).not("erro", "is", null);
    return NextResponse.json({ texto: texto || "", falhas: (ps || []).map(p => p.erro) });
  } catch (e) { return erro(e); }
}
