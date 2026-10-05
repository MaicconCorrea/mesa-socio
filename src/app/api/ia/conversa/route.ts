import { NextRequest, NextResponse } from "next/server";
import { db, dbGlobal } from "@/lib/db";
import { donoAtual } from "@/lib/contexto";
import { erro, naoAutorizado } from "@/lib/api";

// Conversa com a IA guardada por item (conversa do WhatsApp/Google Chat, e-mail ou tarefa) e por sócio.
// Sem o SQL 024 rodado, responde { salvo: false } e a tela segue funcionando só na memória.
export const dynamic = "force-dynamic";

const TIPOS = new Set(["chat", "email", "tarefa"]);
const PAPEIS = new Set(["eu", "ia"]);
const TIPOS_MSG = new Set(["sugestao", "analise", "texto"]);
const semTabela = (m: string) => /ia_conversas|ia_conversa_anexar|does not exist|schema cache|Could not find/i.test(m || "");

function item(tipo: any, ref: any) {
  const t = String(tipo || ""), r = String(ref || "").slice(0, 200);
  return TIPOS.has(t) && r ? { tipo: t, ref: r } : null;
}

// GET ?tipo=chat&ref=<id> → { salvo, mensagens }
export async function GET(req: NextRequest) {
  const dono = donoAtual(); if (!dono) return naoAutorizado();
  const it = item(req.nextUrl.searchParams.get("tipo"), req.nextUrl.searchParams.get("ref"));
  if (!it) return NextResponse.json({ erro: "tipo ou ref inválido" }, { status: 400 });
  const { data, error } = await db().from("ia_conversas").select("mensagens").eq("tipo", it.tipo).eq("ref_id", it.ref).maybeSingle();
  if (error) return NextResponse.json({ salvo: false, mensagens: [], aviso: semTabela(error.message) ? "Falta rodar o SQL 024 no Supabase." : error.message });
  return NextResponse.json({ salvo: true, mensagens: Array.isArray(data?.mensagens) ? data.mensagens : [] });
}

// POST { tipo, ref, mensagens: [{ papel, texto, tipo? }] } → acrescenta no fim
export async function POST(req: NextRequest) {
  const dono = donoAtual(); if (!dono) return naoAutorizado();
  const corpo = await req.json().catch(() => ({}));
  const it = item(corpo.tipo, corpo.ref);
  if (!it) return NextResponse.json({ erro: "tipo ou ref inválido" }, { status: 400 });
  const em = new Date().toISOString();
  const msgs = (Array.isArray(corpo.mensagens) ? corpo.mensagens : []).slice(0, 10)
    .filter((m: any) => m && PAPEIS.has(m.papel) && typeof m.texto === "string" && m.texto.trim())
    .map((m: any) => ({ papel: m.papel, texto: m.texto.slice(0, 60000), ...(TIPOS_MSG.has(m.tipo) ? { tipo: m.tipo } : {}), em }));
  if (!msgs.length) return NextResponse.json({ salvo: false });
  try {
    // função do SQL 024: acrescenta de uma vez só (dono vem do login, nunca do pedido)
    const { error } = await dbGlobal().rpc("ia_conversa_anexar", { p_dono: dono, p_tipo: it.tipo, p_ref: it.ref, p_msgs: msgs });
    if (error) return NextResponse.json({ salvo: false, aviso: semTabela(error.message) ? "Falta rodar o SQL 024 no Supabase." : error.message });
    return NextResponse.json({ salvo: true });
  } catch (e) { return erro(e); }
}

// DELETE { tipo, ref } → apaga a conversa com a IA deste item
export async function DELETE(req: NextRequest) {
  const dono = donoAtual(); if (!dono) return naoAutorizado();
  const corpo = await req.json().catch(() => ({}));
  const it = item(corpo.tipo, corpo.ref);
  if (!it) return NextResponse.json({ erro: "tipo ou ref inválido" }, { status: 400 });
  const { error } = await db().from("ia_conversas").delete().eq("tipo", it.tipo).eq("ref_id", it.ref);
  if (error) return NextResponse.json({ salvo: false, aviso: semTabela(error.message) ? "Falta rodar o SQL 024 no Supabase." : error.message });
  return NextResponse.json({ salvo: true });
}
