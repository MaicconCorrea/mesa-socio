// Preferências da Mesa (tabela config). Valores padrão quando ainda não foram mexidos.
import { db } from "./db";

export const PADRAO = {
  push_whats: true,          // mensagem nova no privado (automático/pessoal)
  push_grupo_citado: true,   // te citaram num grupo do escritório
  push_email: true,          // e-mail de pessoa esperando você
  push_agenda: true,         // reunião em 10 min
  push_prazo: true,          // prazo de tarefa em 30 min
  push_tarefa_nova: true,    // IA criou tarefa
  silencio_noite: true,      // 22h às 7h: sem avisos de mensagem (agenda e prazo continuam)
  resumo_push: true,
  resumo_email: true,
  resumo_whats_para: "",     // número que recebe o resumo no WhatsApp (vazio = não manda)
  resumo_whats_de: "",       // instância que envia (vazio = a primeira)
};
export type Config = typeof PADRAO;

let cache: { em: number; c: Config } | null = null;
export async function lerConfig(): Promise<Config> {
  if (cache && Date.now() - cache.em < 30000) return cache.c;
  const { data } = await db().from("config").select("chave,valor");
  const c: any = { ...PADRAO };
  for (const r of data || []) if (r.chave in PADRAO) c[r.chave] = r.valor;
  cache = { em: Date.now(), c };
  return c;
}
export async function gravarConfig(parcial: Partial<Config>) {
  const linhas = Object.entries(parcial).filter(([k]) => k in PADRAO).map(([chave, valor]) => ({ chave, valor, atualizado_em: new Date().toISOString() }));
  if (linhas.length) await db().from("config").upsert(linhas, { onConflict: "chave" });
  cache = null;
}
