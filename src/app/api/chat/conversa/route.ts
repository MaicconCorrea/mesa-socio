import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// Mensagens de uma conversa + tarefas abertas dela
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id" }, { status: 400 });
  const sb = db();
  const { data: conversa } = await sb.from("conversas").select("*").eq("id", id).single();
  const { data: desc } = await sb.from("mensagens")
    .select("id,msg_id,de_mim,autor,texto,enviada_em,me_citou,tipo,midia_mime,midia_nome,tem_midia,citada_texto")
    .eq("conversa_id", id).order("enviada_em", { ascending: false }).limit(200);
  const { data: tarefas } = await sb.from("tarefas").select("*").eq("conversa_id", id)
    .eq("status", "aberta").order("prazo", { ascending: true, nullsFirst: false });
  return NextResponse.json({ conversa, mensagens: (desc || []).reverse(), tarefas: tarefas || [] });
}
