import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado, erro } from "@/lib/api";
import { marcarLidas } from "@/lib/evolution";

// Marca como lidas no painel E no celular (dois tracinhos azuis)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ ok: true });
  
  try {
    const sb = db();
    // Busca as conversas e suas mensagens não lidas
    const { data: conversas } = await sb.from("conversas").select("id,jid,instancia").in("id", ids);
    if (!conversas?.length) return NextResponse.json({ ok: true });
    
    // Marca no celular (Evolution) e no painel (banco)
    await Promise.all(conversas.map(async c => {
      const { data: msgs } = await sb.from("mensagens").select("id,participante").eq("conversa_id", c.id).eq("lida", false).eq("recebida_em", true);
      if (msgs?.length) await marcarLidas(c.instancia, c.jid, msgs);
    }));
    
    // Atualiza o banco
    await sb.from("conversas").update({ nao_lidas: 0 }).in("id", ids);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
