import { NextResponse } from "next/server";
import { pessoa, sincronizarChat, ultimoErroNome } from "@/lib/gchat";
import { db } from "@/lib/db";
import { lerConfig } from "@/lib/config";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300;

// Relê os últimos 30 dias do Google Chat: acerta nomes e anexos das mensagens antigas
export async function POST() {
  if (!(await logado())) return naoAutorizado();
  try {
    const r = await sincronizarChat({ forcar: true, diasPrimeira: 30 });
    // prévia da lista ("1050521…: texto") → refaz com o nome certo
    const sb = db();
    const { data: cs } = await sb.from("conversas").select("id,is_grupo").eq("instancia", "gchat");
    for (const c of cs || []) {
      const { data: ult } = await sb.from("mensagens").select("de_mim,autor,texto").eq("conversa_id", c.id).order("enviada_em", { ascending: false }).limit(1);
      const m = ult?.[0]; if (!m) continue;
      await sb.from("conversas").update({ ultima_msg_texto: (m.de_mim ? "Você: " : c.is_grupo ? m.autor + ": " : "") + String(m.texto || "").slice(0, 200) }).eq("id", c.id);
    }
    // teste de nome com o meu próprio usuário
    const meuId = ((await lerConfig()) as any).chat_meu_id;
    const teste = meuId ? await pessoa(String(meuId)) : null;
    return NextResponse.json({ ok: true, ...r, nomesFuncionando: !!teste?.achou, erroNome: teste?.achou ? "" : ultimoErroNome });
  } catch (e) { return erro(e); }
}
