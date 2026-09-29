import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listarThreads, resumoThread } from "@/lib/gmail";
import { googleConfigurado, minhaConta } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// filtro: esperando | entrada | naolidos | anexos | enviados | todos
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  if (!googleConfigurado()) return NextResponse.json({ ativo: false });
  const sp = req.nextUrl.searchParams;
  const filtro = sp.get("filtro") || "esperando";
  const busca = sp.get("q") || "";
  const conta = minhaConta();
  const sb = db();
  try {
    const { count: esperando } = await sb.from("email_threads").select("thread_id", { count: "exact", head: true }).eq("esperando", true).eq("status", "nova");
    let threads: any[] = [], proxima: string | null = null;
    if (filtro === "esperando" && !busca) {
      const { data: rows } = await sb.from("email_threads").select("thread_id").eq("esperando", true).eq("status", "nova")
        .order("recebido_em", { ascending: false }).limit(50);
      threads = (await Promise.all((rows || []).map(r => resumoThread(conta, r.thread_id).catch(() => null)))).filter(Boolean) as any[];
    } else {
      const base = ({ entrada: "in:inbox", naolidos: "in:inbox is:unread", anexos: "in:inbox has:attachment", enviados: "in:sent", todos: "in:anywhere", esperando: "in:inbox" } as Record<string, string>)[filtro] ?? "in:inbox";
      const r = await listarThreads(conta, `${base} ${busca}`.trim(), sp.get("pagina") || undefined, 30);
      threads = r.threads; proxima = r.proxima;
    }
    const ids = threads.map(t => t.id);
    const { data: st } = await sb.from("email_threads").select("thread_id,status,resumo,esperando").in("thread_id", ids.length ? ids : ["-"]);
    const porId = new Map((st || []).map(s => [s.thread_id, s]));
    return NextResponse.json({ ativo: true, conta, esperando: esperando || 0, proxima, threads: threads.map(t => ({ ...t, controle: porId.get(t.id) || null })) });
  } catch (e: any) { return NextResponse.json({ ativo: true, conta, erro: String(e.message ?? e) }, { status: 500 }); }
}
