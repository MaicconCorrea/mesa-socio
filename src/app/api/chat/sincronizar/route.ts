import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instancias, listarChats, listarGrupos } from "@/lib/evolution";
import { numeroDoJid } from "@/lib/fmt";
import { paraData } from "@/lib/gravar";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

// Traz a lista de conversas do celular (as dos últimos 90 dias) pra dentro do painel
export async function POST() {
  if (!(await logado())) return naoAutorizado();
  const sb = db();
  const resultado: Record<string, number> = {};
  const encontradas: Record<string, number> = {};
  const limite = Date.now() - 90 * 86400 * 1000;
  try {
    for (const inst of instancias()) {
      const [chats, grupos] = await Promise.all([listarChats(inst), listarGrupos(inst)]);
      const nomeGrupo = new Map(grupos.map(g => [g.id, g.subject]));
      const { data: ja } = await sb.from("conversas").select("jid").eq("instancia", inst);
      const existentes = new Set((ja || []).map((x: any) => x.jid));
      const novas: any[] = [];
      for (const ch of chats) {
        const jid: string = ch.remoteJid || ch.id || "";
        if (!jid || !jid.includes("@") || jid.endsWith("@lid") || jid.includes("broadcast") || jid.endsWith("@newsletter") || existentes.has(jid)) continue;
        const quando = ch.updatedAt ? new Date(ch.updatedAt) : (ch.lastMessage?.messageTimestamp ? paraData(ch.lastMessage.messageTimestamp) : null);
        if (quando && quando.getTime() < limite) continue;
        const isGrupo = jid.endsWith("@g.us");
        novas.push({
          instancia: inst, jid, is_grupo: isGrupo, modo: isGrupo ? "grupo" : "auto",
          nome: (isGrupo ? nomeGrupo.get(jid) : null) || ch.name || ch.pushName || numeroDoJid(jid),
          foto_url: ch.profilePicUrl || null,
          ultima_msg_em: quando && !isNaN(quando.getTime()) ? quando.toISOString() : null,
        });
        existentes.add(jid);
      }
      for (let i = 0; i < novas.length; i += 200) {
        await sb.from("conversas").upsert(novas.slice(i, i + 200), { onConflict: "instancia,jid", ignoreDuplicates: true });
      }
      // grupos que ficaram só com o número (ex.: 120363…): põe o nome
      const { data: semNome } = await sb.from("conversas").select("id,jid,nome").eq("instancia", inst).eq("is_grupo", true);
      for (const c of semNome || []) {
        if (/^\d{10,}/.test(c.nome || "") && nomeGrupo.get(c.jid)) await sb.from("conversas").update({ nome: nomeGrupo.get(c.jid) }).eq("id", c.id);
      }
      resultado[inst] = novas.length;
      encontradas[inst] = chats.length;
    }
    return NextResponse.json({ ok: true, novas: resultado, encontradas });
  } catch (e) { return erro(e); }
}
