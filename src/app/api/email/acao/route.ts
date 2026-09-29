import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modificarThread, resumoThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { registrarThread } from "@/lib/email-sync";
import { logado, naoAutorizado } from "@/lib/api";

// resolvido (tira de "esperando"), ignorar, reabrir, arquivar, nao_lido
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { threadId, acao } = await req.json().catch(() => ({}));
  const conta = minhaConta();
  const sb = db();
  try {
    const { data: ja } = await sb.from("email_threads").select("thread_id").eq("thread_id", threadId).maybeSingle();
    if (!ja) await registrarThread(await resumoThread(conta, threadId));
    const upd = (p: any) => sb.from("email_threads").update(p).eq("thread_id", threadId);
    if (acao === "resolvido") { await upd({ status: "tratada" }); await modificarThread(conta, threadId, [], ["UNREAD"]).catch(() => {}); }
    else if (acao === "ignorar") { await upd({ status: "ignorada" }); await modificarThread(conta, threadId, [], ["UNREAD"]).catch(() => {}); }
    else if (acao === "reabrir") await upd({ status: "nova" });
    else if (acao === "arquivar") { await modificarThread(conta, threadId, [], ["INBOX"]); await upd({ status: "tratada" }); }
    else if (acao === "nao_lido") await modificarThread(conta, threadId, ["UNREAD"], []);
    else if (acao === "lido") await modificarThread(conta, threadId, [], ["UNREAD"]);
    else return NextResponse.json({ erro: "ação inválida" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
