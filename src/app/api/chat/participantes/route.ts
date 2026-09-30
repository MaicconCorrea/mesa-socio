import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participantesGrupo } from "@/lib/evolution";
import { participantesChat } from "@/lib/gchat";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Quem pode ser marcado com @ nesta conversa
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  const sb = db();
  const { data: c } = await sb.from("conversas").select("instancia,jid,is_grupo").eq("id", id).maybeSingle();
  if (!c || !c.is_grupo) return NextResponse.json({ participantes: [] });
  let lista = c.instancia === "gchat" ? await participantesChat(c.jid) : await participantesGrupo(c.instancia, c.jid);
  // nomes melhores: como a pessoa aparece nas mensagens do grupo
  if (c.instancia !== "gchat") {
    const { data: ms } = await sb.from("mensagens").select("participante,autor").eq("conversa_id", id).eq("de_mim", false).not("participante", "is", null).order("enviada_em", { ascending: false }).limit(400);
    const nomes = new Map<string, string>();
    for (const m of ms || []) if (m.participante && m.autor && !nomes.has(m.participante) && !/^\d+$/.test(m.autor)) nomes.set(m.participante, m.autor);
    lista = lista.map(p => ({ ...p, nome: nomes.get(p.id) || p.nome }));
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome));
  return NextResponse.json({ participantes: lista });
}
