import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setorDoPainel } from "@/lib/painel-auth";
import { analisarReuniao } from "@/lib/reunioes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Usado pelos painéis de setor (DP, Contábil, BPO…): GET lista / ?id= detalhe com transcrição; POST {id, acao:"reanalisar"}
export async function GET(req: NextRequest) {
  const setor = await setorDoPainel(req);
  if (!setor) return NextResponse.json({ erro: "chave do painel inválida" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const sb = db();
  if (id) {
    const { data } = await sb.from("reunioes").select("*").eq("id", id).eq("setor", setor).single();
    if (!data) return NextResponse.json({ erro: "não encontrada" }, { status: 404 });
    return NextResponse.json(data);
  }
  const { data } = await sb.from("reunioes").select("id,titulo,data,autor_nome,autor_email,resumo,decisoes,participantes,tarefas_equipe,analisada_em,ia_erro")
    .eq("setor", setor).order("data", { ascending: false }).limit(100);
  return NextResponse.json({ setor, reunioes: data || [] });
}

export async function POST(req: NextRequest) {
  const setor = await setorDoPainel(req);
  if (!setor) return NextResponse.json({ erro: "chave do painel inválida" }, { status: 401 });
  const { id, acao } = await req.json().catch(() => ({}));
  const { data } = await db().from("reunioes").select("id").eq("id", id).eq("setor", setor).single();
  if (!data) return NextResponse.json({ erro: "não encontrada" }, { status: 404 });
  if (acao === "reanalisar") { try { return NextResponse.json({ ok: true, ...(await analisarReuniao(id)) }); } catch (e: any) { return NextResponse.json({ erro: e.message }, { status: 500 }); } }
  return NextResponse.json({ erro: "ação inválida" }, { status: 400 });
}
