import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await logado())) return naoAutorizado();
  const sb = db();
  const { data: reunioes } = await sb.from("reunioes").select("id,titulo,data,link,origem,resumo,decisoes,participantes,analisada_em,ia_erro,setor,autor_nome,tarefas_equipe,conduzida_por")
    .order("data", { ascending: false, nullsFirst: false }).limit(150);
  const ids = (reunioes || []).map(r => r.id);
  const { data: tarefas } = await sb.from("tarefas").select("*").in("reuniao_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  return NextResponse.json({ reunioes: reunioes || [], tarefas: tarefas || [] });
}
