import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { donoDaInstancia, fotoPerfil, historico } from "@/lib/evolution";
import { gravarMensagem } from "@/lib/gravar";
import { GCHAT, sincronizarChat } from "@/lib/gchat";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// Puxa o histórico da conversa guardado na Evolution (uma vez por conversa; "forcar" repete)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, forcar, qtd, conferir } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  if (c.modo === "ignorada") return NextResponse.json({ ok: true, importadas: 0 });
  if (c.instancia === GCHAT) {
    if (c.historico_em && !forcar && !conferir) return NextResponse.json({ ok: true, importadas: 0, ja: true });
    try {
      const r = await sincronizarChat({ espaco: c.jid, historico: !!forcar, diasPrimeira: forcar ? 60 : 14 });
      if (!conferir) await sb.from("conversas").update({ historico_em: new Date().toISOString() }).eq("id", c.id);
      return NextResponse.json({ ok: true, importadas: r.mensagens });
    } catch (e) { return erro(e); }
  }
  if (c.historico_em && !forcar && !conferir) return NextResponse.json({ ok: true, importadas: 0, ja: true });
  try {
    const dono = await donoDaInstancia(c.instancia);
    const n = Math.min(Number(qtd) || 60, 200);
    const lista = [...await historico(c.instancia, c.jid, n), ...(c.lid ? await historico(c.instancia, c.lid, n) : [])];
    let importadas = 0;
    for (const m of lista) { if (await gravarMensagem(sb, c.instancia, dono, m, { historico: true, jid: c.jid })) importadas++; }
    if (conferir) return NextResponse.json({ ok: true, importadas });
    const upd: any = { historico_em: new Date().toISOString() };
    if (!c.foto_url && !c.is_grupo) upd.foto_url = await fotoPerfil(c.instancia, c.jid);
    await sb.from("conversas").update(upd).eq("id", c.id);
    return NextResponse.json({ ok: true, importadas, encontradas: lista.length });
  } catch (e) { return erro(e); }
}
