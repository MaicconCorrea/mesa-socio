import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerThread, textoDaThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { chamarClaude, MODELO, marcarConflito } from "@/lib/analise";
import { agoraTexto } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// GET ?threadId= → IA sugere a tarefa (título, tipo, prazo) · POST → cria a tarefa ligada ao e-mail
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const threadId = req.nextUrl.searchParams.get("threadId") || "";
  try {
    const t = await lerThread(minhaConta(), threadId);
    const sis = `Você é o secretário do Maiccon, sócio da Outtax (escritório de contabilidade). Ele quer transformar este e-mail em UMA tarefa pra ele.
Escreva o título começando com verbo no infinitivo e citando a pessoa/empresa (ex.: "Instalar certificado digital enviado por Pedro Anjos").
Se houver prazo no e-mail, use; senão sugira um prazo razoável (ISO 8601 com -03:00) ou null.
Responda SOMENTE JSON: {"titulo":"","tipo":"pedido|promessa|reuniao|outro","prazo":null,"detalhe":"1 frase"}`;
    const { obj } = await chamarClaude(sis, `Agora: ${agoraTexto()}\nAssunto: ${t.assunto}\n\n${textoDaThread(t).slice(-8000)}`, MODELO(), 500);
    return NextResponse.json({ ...obj, quem: t.mensagens[t.mensagens.length - 1]?.de || null });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const titulo = String(b.titulo || "").trim();
  if (!b.threadId || !titulo) return NextResponse.json({ erro: "Escreva o título da tarefa." }, { status: 400 });
  const sb = db();
  const prazo = b.prazo ? new Date(String(b.prazo).length <= 16 ? `${b.prazo}:00-03:00` : b.prazo).toISOString() : null;
  const dono = req.headers.get("x-mesa-dono") || "";
  const { data, error } = await sb.from("tarefas").insert({
    email_thread_id: b.threadId, tipo: ["pedido", "promessa", "reuniao", "outro"].includes(b.tipo) ? b.tipo : "pedido",
    categoria: b.categoria === "pessoal" ? "pessoal" : "trabalho", titulo: titulo.slice(0, 200), detalhe: b.detalhe || null,
    quem: b.quem || null, prazo, origem: "email",
    ...(dono ? { dono } : {}),
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (data && prazo && b.tipo === "reuniao") await marcarConflito(data.id, prazo);
  if (b.tirarDaLista) await sb.from("email_threads").update({ status: "tratada" }).eq("thread_id", b.threadId);
  return NextResponse.json({ ok: true, id: data?.id });
}
