// Banco com "filtro de dono": com um sócio definido (login ou comDono), toda consulta às tabelas
// pessoais já vem filtrada por ele e toda gravação já leva o dono. Sem dono (crons globais, webhook
// antes de saber o número) o acesso é geral — essas rotinas definem o dono assim que descobrem.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { donoAtual } from "./contexto";

let base: SupabaseClient | null = null;
export function dbGlobal(): SupabaseClient {
  if (!base) base = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return base;
}

const DO_DONO = new Set(["conversas", "mensagens", "tarefas", "email_threads", "chamados", "ia_uso", "push_assinaturas", "avisos_enviados", "numeros"]);

function comDonoNoValor(v: any, d: string) {
  const um = (x: any) => (x && typeof x === "object" && !x.dono ? { ...x, dono: d } : x);
  return Array.isArray(v) ? v.map(um) : um(v);
}

function escopo(sb: SupabaseClient, tabela: string, d: string) {
  const q: any = sb.from(tabela);
  if (tabela === "reunioes") {
    // minhas reuniões + as da equipe (gravadas pelos setores)
    const filtro = `dono.eq."${d}",and(setor.not.is.null,setor.neq.SOCIOS)`;
    return {
      select: (...a: any[]) => q.select(...a).or(filtro),
      update: (v: any, o?: any) => q.update(v, o).or(filtro),
      delete: (o?: any) => q.delete(o).or(filtro),
      insert: (v: any, o?: any) => q.insert(comDonoNoValor(v, d), o),
      upsert: (v: any, o?: any) => q.upsert(comDonoNoValor(v, d), o),
    };
  }
  if (!DO_DONO.has(tabela)) return q;
  return {
    select: (...a: any[]) => q.select(...a).eq("dono", d),
    update: (v: any, o?: any) => q.update(v, o).eq("dono", d),
    delete: (o?: any) => q.delete(o).eq("dono", d),
    insert: (v: any, o?: any) => q.insert(comDonoNoValor(v, d), o),
    upsert: (v: any, o?: any) => q.upsert(comDonoNoValor(v, d), o),
  };
}

export function db(): any {
  const sb = dbGlobal();
  const d = donoAtual();
  if (!d) return sb;
  return new Proxy(sb, { get(alvo, prop, rec) { return prop === "from" ? (t: string) => escopo(alvo, t, d) : Reflect.get(alvo, prop, rec); } });
}
