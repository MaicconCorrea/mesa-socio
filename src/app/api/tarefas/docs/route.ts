import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { donoAtual } from "@/lib/contexto";
import { apagarDoc, linkParaSubir } from "@/lib/docs";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET ?tarefaId= → documentos da tarefa
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { data } = await db().from("tarefa_docs").select("id,nome,mime,tamanho,criado_em").eq("tarefa_id", req.nextUrl.searchParams.get("tarefaId") || "").order("criado_em");
  return NextResponse.json({ docs: data || [] });
}

// POST { tarefaId, nome, mime, tamanho, etapa: "preparar" | "confirmar", caminho? }
// preparar → devolve um link para o navegador mandar o arquivo direto pro armazenamento; confirmar → registra na tarefa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const sb = db();
  const { data: t } = await sb.from("tarefas").select("id").eq("id", b.tarefaId).maybeSingle();
  if (!t) return NextResponse.json({ erro: "tarefa não encontrada" }, { status: 404 });
  try {
    if (b.etapa === "preparar") {
      const limpo = String(b.nome || "arquivo").normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-80);
      const caminho = `${(donoAtual() || "x").replace(/[^\w.-]/g, "_")}/${t.id}/${Date.now()}-${limpo}`;
      return NextResponse.json({ caminho, url: await linkParaSubir(caminho) });
    }
    const caminho = String(b.caminho || "");
    if (!caminho.includes(`/${t.id}/`)) return NextResponse.json({ erro: "caminho inválido" }, { status: 400 });
    const { data } = await sb.from("tarefa_docs").insert({ tarefa_id: t.id, nome: String(b.nome || "arquivo").slice(0, 200), mime: b.mime || null, caminho, tamanho: Number(b.tamanho) || null }).select("id,nome,mime,tamanho").single();
    return NextResponse.json({ ok: true, doc: data });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  const { data: d } = await db().from("tarefa_docs").select("id,caminho").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  await apagarDoc(d.caminho).catch(() => {});
  await db().from("tarefa_docs").delete().eq("id", d.id);
  return NextResponse.json({ ok: true });
}
