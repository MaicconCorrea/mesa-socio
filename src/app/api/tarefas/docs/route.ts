import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { donoAtual } from "@/lib/contexto";
import { apagarDoc, linkParaSubir, processarDoc } from "@/lib/docs";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // leitura de PDF escaneado grande pode levar alguns minutos

// GET ?tarefaId= → documentos da tarefa
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const verTexto = req.nextUrl.searchParams.get("texto");
  if (verTexto) {
    const { data } = await db().from("tarefa_docs").select("nome,texto").eq("id", verTexto).maybeSingle();
    return NextResponse.json({ nome: data?.nome, texto: data?.texto || "" });
  }
  const { data } = await db().from("tarefa_docs").select("id,nome,mime,tamanho,criado_em,status,paginas,erro").eq("tarefa_id", req.nextUrl.searchParams.get("tarefaId") || "").order("criado_em");
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
    if (b.etapa === "reler") {
      const { data: d } = await sb.from("tarefa_docs").select("id,nome,mime,caminho").eq("id", b.docId).maybeSingle();
      if (!d) return NextResponse.json({ erro: "documento não encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, doc: { id: d.id, nome: d.nome, ...(await processarDoc(sb, d)) } });
    }
    if (b.etapa === "preparar") {
      const limpo = String(b.nome || "arquivo").normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-80);
      const caminho = `${(donoAtual() || "x").replace(/[^\w.-]/g, "_")}/${t.id}/${Date.now()}-${limpo}`;
      return NextResponse.json({ caminho, url: await linkParaSubir(caminho) });
    }
    const caminho = String(b.caminho || "");
    if (!caminho.includes(`/${t.id}/`)) return NextResponse.json({ erro: "caminho inválido" }, { status: 400 });
    const { data } = await sb.from("tarefa_docs").insert({ tarefa_id: t.id, nome: String(b.nome || "arquivo").slice(0, 200), mime: b.mime || null, caminho, tamanho: Number(b.tamanho) || null, status: "lendo" }).select("id,nome,mime,tamanho,caminho").single();
    const r = await processarDoc(sb, data); // lê agora (PDF escaneado: página por página)
    return NextResponse.json({ ok: true, doc: { id: data.id, nome: data.nome, tamanho: data.tamanho, ...r } });
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
