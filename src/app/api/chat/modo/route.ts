import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, modo } = await req.json().catch(() => ({}));
  if (!id || !["auto", "pessoal", "grupo", "ignorada"].includes(modo)) return NextResponse.json({ erro: "dados" }, { status: 400 });
  const sb = db();
  const upd: any = { modo, ignorada: modo === "ignorada" };
  if (modo !== "grupo") { upd.sem_retorno = false; upd.checar_parado = false; }
  if (modo === "pessoal" || modo === "ignorada") upd.precisa_resposta = false;
  if (modo === "ignorada") { upd.pendente_ia = false; upd.resumo = null; upd.nao_lidas = 0; }
  await sb.from("conversas").update(upd).eq("id", id);
  if (modo === "ignorada") {
    await sb.from("mensagens").delete().eq("conversa_id", id);
    await sb.from("tarefas").update({ status: "descartada" }).eq("conversa_id", id).eq("status", "aberta");
  }
  return NextResponse.json({ ok: true });
}
