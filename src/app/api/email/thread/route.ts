import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerThread, modificarThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Abre o e-mail (e marca como lido no Gmail) + tarefas ligadas
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  try {
    const t = await lerThread(minhaConta(), id);
    modificarThread(minhaConta(), id, [], ["UNREAD"]).catch(() => {});
    const sb = db();
    const { data: controle } = await sb.from("email_threads").select("*").eq("thread_id", id).maybeSingle();
    const { data: tarefas } = await sb.from("tarefas").select("*").eq("email_thread_id", id).eq("status", "aberta");
    return NextResponse.json({ ...t, controle, tarefas: tarefas || [] });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
