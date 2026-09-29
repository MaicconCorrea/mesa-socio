import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instancias } from "@/lib/evolution";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// Lista de conversas (todas as conexões). O filtro é feito na tela.
export async function GET() {
  if (!(await logado())) return naoAutorizado();
  const { data, error } = await db().from("conversas")
    .select("id,instancia,jid,nome,is_grupo,modo,ultima_msg_em,ultima_msg_de_mim,ultima_msg_texto,nao_lidas,precisa_resposta,sem_retorno,resumo,foto_url")
    .order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(600);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ conexoes: instancias(), conversas: data || [] });
}
