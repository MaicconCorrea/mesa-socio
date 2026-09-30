import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado, erro } from "@/lib/api";
import { marcarLidas } from "@/lib/evolution";

// Marca como lida no painel E no celular ao abrir a conversa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: true });
  
  try {
    const sb = db();
    // Busca a conversa
    const { data: c } = await sb.from("conversas").select("id,jid,instancia,nao_lidas").eq("id", id).single();
    if (!c || !c.nao_lidas) return NextResponse.json({ ok: true });
    
    // Busca mensagens não lidas
    const { data: msgs } = await sb.from("mensagens").select("id,participante").eq("conversa_id", id).eq("lida", false).eq("recebida_em", true);
    if (msgs?.length) await marcarLidas(c.instancia, c.jid, msgs);
    
    // Atualiza o banco
    await sb.from("conversas").update({ nao_lidas: 0 }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
