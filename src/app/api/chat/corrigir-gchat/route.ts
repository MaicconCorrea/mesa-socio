import { NextResponse } from "next/server";
import { pessoa, sincronizarChat, ultimoErroNome } from "@/lib/gchat";
import { db } from "@/lib/db";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300;

// Relê os últimos 30 dias do Google Chat: acerta nomes e anexos das mensagens antigas
export async function POST() {
  if (!(await logado())) return naoAutorizado();
  try {
    const r = await sincronizarChat({ forcar: true, diasPrimeira: 30 });
    // teste de nome com o meu próprio usuário
    const cfg: any = (await db().from("config").select("valor").eq("chave", "chat_meu_id").maybeSingle()).data;
    const teste = cfg?.valor ? await pessoa(String(cfg.valor)) : null;
    return NextResponse.json({ ok: true, ...r, nomesFuncionando: !!teste?.achou, erroNome: teste?.achou ? "" : ultimoErroNome });
  } catch (e) { return erro(e); }
}
