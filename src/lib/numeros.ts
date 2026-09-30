// Números de WhatsApp de cada sócio (tabela numeros) — cada um cadastra, nomeia e remove os seus
import { db, dbGlobal } from "./db";

export type Numero = { instancia: string; nome: string; ativo: boolean };

export async function meusNumeros(incluirInativos = false): Promise<Numero[]> {
  let q = db().from("numeros").select("instancia,nome,ativo").order("criado_em");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data } = await q;
  return (data || []) as Numero[];
}
export async function minhasInstancias(): Promise<string[]> { return (await meusNumeros()).map(n => n.instancia); }

// Nome que o sócio deu ao número
const nomes = new Map<string, { em: number; nome: string }>();
export async function nomeDoNumero(instancia: string): Promise<string> {
  if (instancia === "gchat") return "Google Chat";
  const c = nomes.get(instancia); if (c && Date.now() - c.em < 60000) return c.nome;
  const { data } = await dbGlobal().from("numeros").select("nome").eq("instancia", instancia).maybeSingle();
  const nome = data?.nome || instancia.replace(/^socio-/, "");
  nomes.set(instancia, { em: Date.now(), nome });
  return nome;
}

// De quem é esse número? (usado pelo webhook, que não tem login)
const cache = new Map<string, { em: number; dono: string | null }>();
export async function donoDoNumero(instancia: string): Promise<string | null> {
  const c = cache.get(instancia); if (c && Date.now() - c.em < 60000) return c.dono;
  const { data } = await dbGlobal().from("numeros").select("dono").eq("instancia", instancia).maybeSingle();
  const dono = data?.dono || null;
  cache.set(instancia, { em: Date.now(), dono });
  return dono;
}
