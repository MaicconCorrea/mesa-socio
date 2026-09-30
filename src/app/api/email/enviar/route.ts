import { NextRequest, NextResponse } from "next/server";
import { socioAtual } from "@/lib/socios";
import { db } from "@/lib/db";
import { baixarAnexo, enviarEmail } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// Responde (threadId) ou envia e-mail novo. Anexos: do computador (base64) ou do próprio e-mail ("msg|att|nome|mime")
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const para = String(b.para || "").trim(), corpo = String(b.corpo || "");
  if (!para || !corpo.trim()) return NextResponse.json({ erro: "Preencha destinatário e mensagem." }, { status: 400 });
  const conta = minhaConta();
  try {
    const anexos: { nome: string; bytes: Buffer; mime?: string }[] = [];
    for (const a of b.arquivos || []) anexos.push({ nome: a.nome, mime: a.mime, bytes: Buffer.from(a.base64, "base64") });
    for (const s of (b.anexosEmail || []) as string[]) { const [msg, att, nome, mime] = s.split("|"); anexos.push({ nome, mime, bytes: await baixarAnexo(conta, msg, att) }); }
    await enviarEmail(conta, (await socioAtual()).nome, {
      para, cc: b.cc || undefined, assunto: String(b.assunto || ""), corpo, threadId: b.threadId || undefined,
      inReplyTo: b.inReplyTo || undefined, references: b.references || undefined, anexos,
    });
    if (b.threadId) await db().from("email_threads").update({ status: "tratada", esperando: false, ultima_minha: true }).eq("thread_id", b.threadId);
    return NextResponse.json({ ok: true, anexos: anexos.length });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
