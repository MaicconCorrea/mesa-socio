// Recebe as mensagens da Evolution (instâncias socio-1200 e socio-3710)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { soNumero } from "@/lib/evolution";
import { gravarMensagem } from "@/lib/gravar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, erro: "segredo inválido" }, { status: 401 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true, ignorado: "json" }); }

  const evento = String(body?.event || "").toLowerCase().replace(/_/g, ".");
  const instancia = String(body.instance || body.instanceName || "desconhecida");

  // registro (pra diagnosticar): guarda um resumo de cada evento, sem o texto
  try {
    const d = Array.isArray(body.data) ? body.data[0] : body.data?.messages?.[0] ?? body.data;
    const k = d?.key || {};
    await db().from("webhook_log").insert({ evento, instancia, resumo: {
      fromMe: k.fromMe, remoteJid: k.remoteJid, remoteJidAlt: k.remoteJidAlt, senderPn: k.senderPn, senderLid: k.senderLid,
      participant: k.participant, tipo: d?.messageType, status: d?.status, source: d?.source } });
  } catch { /* segue */ }

  if (!evento.includes("messages.upsert") && !evento.includes("send.message")) return NextResponse.json({ ok: true, ignorado: evento });

  const meuNumero = soNumero(body.sender);
  const lista: any[] = Array.isArray(body.data) ? body.data
    : Array.isArray(body.data?.messages) ? body.data.messages : [body.data];

  const sb = db();
  let gravadas = 0;
  for (const m of lista) { if (await gravarMensagem(sb, instancia, meuNumero, m)) gravadas++; }
  return NextResponse.json({ ok: true, gravadas });
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook evolution · mesa-socio" });
}
