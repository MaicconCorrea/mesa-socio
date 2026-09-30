import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarTextoCitando } from "@/lib/evolution";
import { enviarChat, GCHAT } from "@/lib/gchat";
import { marcarLidasAoResponder, registrarEnvio } from "@/lib/envio";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, texto, citadaId, mencoes } = await req.json().catch(() => ({}));
  const marcas: { id: string; nome: string }[] = Array.isArray(mencoes) ? mencoes.filter((m: any) => m?.id && m?.nome) : [];
  const t = String(texto || "").trim();
  if (!id || !t) return NextResponse.json({ erro: "faltou texto" }, { status: 400 });
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  let citada: any = null;
  if (citadaId) {
    const { data: q } = await sb.from("mensagens").select("msg_id,texto,de_mim").eq("id", citadaId).single();
    if (q) citada = { id: q.msg_id, texto: q.texto, deMim: q.de_mim };
  }
  try {
    // @Nome no texto → marcação de verdade (Google Chat: <users/ID>; WhatsApp: @número + lista de marcados)
    const usadas = marcas.filter(m => t.includes(`@${m.nome}`)).sort((a, b) => b.nome.length - a.nome.length); // nome maior primeiro
    if (c.instancia === GCHAT) {
      let tx = t;
      for (const m of usadas) tx = tx.split(`@${m.nome}`).join(m.id === "todos" ? "<users/all>" : `<${m.id}>`);
      const r = await enviarChat(c.jid, tx);
      await registrarEnvio(sb, c, { msg_id: r.id, texto: t, tipo: "texto" });
      return NextResponse.json({ ok: true });
    }
    await marcarLidasAoResponder(sb, c);
    let tx = t;
    const todos = usadas.some(m => m.id === "todos");
    for (const m of usadas) if (m.id !== "todos") tx = tx.split(`@${m.nome}`).join(`@${m.id.split("@")[0]}`);
    const r = await enviarTextoCitando(c.instancia, c.jid, tx, citada, { todos, ids: usadas.filter(m => m.id !== "todos").map(m => m.id) });
    await registrarEnvio(sb, c, { msg_id: r.id, texto: t, tipo: "texto", citada_texto: citada?.texto || null });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
