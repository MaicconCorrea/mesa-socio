// Preferências da Mesa (tabela config). Valores padrão quando ainda não foram mexidos.
import { dbGlobal } from "./db";
import { donoAtual } from "./contexto";
import { ehAdminMesa, SO_ADMIN_GLOBAIS } from "./acesso";

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
  estilo_escrita: "",        // "meu jeito de escrever" (a IA imita nas sugestões)
  sugestao_auto: true,       // IA deixa uma resposta sugerida pronta em cada conversa
  chat_meu_id: "",           // meu users/… no Google Chat (descoberto sozinho)
  chave_gravador: "",        // chave da extensão do Chrome que grava reuniões (modo antigo, só o Maiccon)
  chaves_painel: {} as Record<string, string>, // chave de cada painel de setor para ler as reuniões do setor
};
export type Config = typeof PADRAO;

// Configurações do escritório (valem para todos os sócios); o resto é de cada sócio
// (só administradores da Mesa — MESA_ADMINS — leem/alteram pelas telas e rotas; ver lib/acesso)
export const GLOBAIS = new Set<string>(["chaves_painel", "chave_gravador"]);
export const temGlobal = (parcial: Record<string, unknown>) => Object.keys(parcial || {}).some(k => GLOBAIS.has(k));
// cópia da config sem as globais (para quem não é administrador)
export function semGlobais<T extends Record<string, any>>(c: T): T {
  const out: any = { ...c };
  GLOBAIS.forEach(k => { delete out[k]; });
  return out;
}
const dono = () => donoAtual() || (process.env.MEU_EMAIL || "maiccon@outtax.com.br").toLowerCase();

const cache = new Map<string, { em: number; c: Config }>();
export async function lerConfig(): Promise<Config> {
  const d = dono();
  const c0 = cache.get(d); if (c0 && Date.now() - c0.em < 30000) return c0.c;
  const { data } = await dbGlobal().from("config").select("dono,chave,valor").in("dono", ["*", d]);
  const c: any = { ...PADRAO };
  for (const r of (data || []).sort((a: any, b: any) => (a.dono === "*" ? -1 : 1) - (b.dono === "*" ? -1 : 1)))
    if (r.chave in PADRAO && (GLOBAIS.has(r.chave) ? r.dono === "*" : true)) c[r.chave] = r.valor;
  cache.set(d, { em: Date.now(), c });
  return c;
}
export async function gravarConfig(parcial: Partial<Config>) {
  const d = dono();
  // reforço: com um sócio logado/definido, chave global só é gravada por administrador
  const quem = donoAtual();
  if (quem && temGlobal(parcial as any) && !ehAdminMesa(quem)) throw new Error(SO_ADMIN_GLOBAIS);
  const linhas = Object.entries(parcial).filter(([k]) => k in PADRAO)
    .map(([chave, valor]) => ({ dono: GLOBAIS.has(chave) ? "*" : d, chave, valor, atualizado_em: new Date().toISOString() }));
  if (linhas.length) await dbGlobal().from("config").upsert(linhas, { onConflict: "dono,chave" });
  cache.clear();
}
