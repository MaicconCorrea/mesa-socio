import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fimDoDia } from "@/lib/fmt";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await logado())) return naoAutorizado();
  const sb = db();
  const { data: nl } = await sb.from("conversas").select("nao_lidas").gt("nao_lidas", 0).in("modo", ["auto", "pessoal"]);
  const { count: esperando } = await sb.from("conversas").select("id", { count: "exact", head: true })
    .eq("precisa_resposta", true).eq("ultima_msg_de_mim", false).in("modo", ["auto", "grupo"]);
  const { count: tarefasHoje } = await sb.from("tarefas").select("id", { count: "exact", head: true })
    .eq("status", "aberta").lte("prazo", fimDoDia().toISOString());
  return NextResponse.json({
    naoLidas: (nl || []).reduce((s, c) => s + (c.nao_lidas || 0), 0),
    esperando: esperando || 0,
    tarefasHoje: tarefasHoje || 0,
  });
}
