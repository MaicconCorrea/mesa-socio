// Digisac (só o necessário para os Contatos): ler contatos, listar conexões e criar/renomear contato.
// Mesmas variáveis da Célula de Entrada: DIGISAC_BASE_URL (ex.: https://outtax.digisac.me/api/v1) e DIGISAC_TOKEN.
// (DIGISAC_URL, nome usado no Painel BPO, também é aceito.)

import { AVISO_DIGISAC, type ChaveConexao } from "./contatos-comum";

const base = () => (process.env.DIGISAC_BASE_URL || process.env.DIGISAC_URL || "").replace(/\/+$/, "");
export const digisacConfigurado = () => !!(base() && process.env.DIGISAC_TOKEN);

async function chamar(caminho: string, opcoes: { metodo?: string; corpo?: unknown; tempo?: number } = {}) {
  if (!digisacConfigurado()) throw new Error(AVISO_DIGISAC);
  const r = await fetch(base() + caminho, {
    method: opcoes.metodo || "GET",
    headers: { Authorization: `Bearer ${process.env.DIGISAC_TOKEN}`, "Content-Type": "application/json" },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(opcoes.tempo ?? 15000),
  });
  const t = await r.text();
  let j: any = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error(`Digisac ${r.status}: ${String(typeof j === "string" ? j : JSON.stringify(j)).slice(0, 200)}`);
  return j;
}
const lista = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);

export type ContatoDigisac = { id: string; nome: string; numero: string; serviceId: string | null };
const paraContato = (c: any): ContatoDigisac => ({
  id: String(c.id), nome: String(c.internalName || c.name || "").trim(),
  numero: String(c?.data?.number ?? c.number ?? "").replace(/\D/g, ""), serviceId: c.serviceId ? String(c.serviceId) : null,
});

// ---- Conexões (services): só Atendimento e BPO ----
export type ConexaoDigisac = { chave: ChaveConexao; id: string; nome: string; origem: "variavel" | "api" };
let cacheConexoes: { em: number; lista: ConexaoDigisac[]; erro?: string } | null = null;

export async function conexoesDigisac(): Promise<{ lista: ConexaoDigisac[]; erro?: string }> {
  if (!digisacConfigurado()) return { lista: [], erro: AVISO_DIGISAC };
  if (cacheConexoes && Date.now() - cacheConexoes.em < 10 * 60000) return cacheConexoes;
  const fixas: Partial<Record<ChaveConexao, string>> = {
    atendimento: process.env.DIGISAC_SERVICE_ATENDIMENTO?.trim() || undefined,
    bpo: process.env.DIGISAC_SERVICE_BPO?.trim() || undefined,
  };
  let servicos: any[] = [], erro: string | undefined;
  try { servicos = lista(await chamar(`/services?perPage=100`)); } catch (e: any) { erro = String(e?.message || e); }
  const ativo = (s: any) => !s?.archivedAt && !s?.deletedAt && s?.isArchived !== true;
  const out: ConexaoDigisac[] = [];
  for (const chave of ["atendimento", "bpo"] as ChaveConexao[]) {
    const id = fixas[chave];
    if (id) {
      const s = servicos.find(x => String(x.id) === id);
      out.push({ chave, id, nome: s?.name || (chave === "bpo" ? "BPO" : "Atendimento"), origem: "variavel" });
      continue;
    }
    const re = chave === "bpo" ? /\bbpo\b/i : /atendimento/i;
    const s = servicos.filter(ativo).find(x => re.test(String(x.name || "")));
    if (s) out.push({ chave, id: String(s.id), nome: String(s.name), origem: "api" });
  }
  if (!out.length && !erro) erro = "Nenhuma conexão com nome de Atendimento ou BPO no Digisac. Cadastre DIGISAC_SERVICE_ATENDIMENTO e DIGISAC_SERVICE_BPO na Vercel.";
  cacheConexoes = { em: Date.now(), lista: out, erro };
  return cacheConexoes;
}

// ---- Todos os contatos individuais (para cruzar), em cache curto ----
let cacheContatos: { em: number; lista: ContatoDigisac[]; parcial: boolean; erro?: string } | null = null;
export function limparCacheDigisac() { cacheContatos = null; }

export async function contatosDigisac(): Promise<{ lista: ContatoDigisac[]; parcial: boolean; erro?: string }> {
  if (!digisacConfigurado()) return { lista: [], parcial: false, erro: AVISO_DIGISAC };
  if (cacheContatos && Date.now() - cacheContatos.em < 10 * 60000) return cacheContatos;
  const out: ContatoDigisac[] = [];
  const inicio = Date.now();
  let parcial = false, erro: string | undefined;
  for (let pagina = 1; pagina <= 150; pagina++) {
    if (Date.now() - inicio > 25000) { parcial = true; break; }
    try {
      const j = await chamar(`/contacts?where[isGroup]=false&perPage=100&page=${pagina}`, { tempo: 12000 });
      const arr = lista(j);
      out.push(...arr.map(paraContato).filter(c => c.numero));
      const ultima = Number(j?.lastPage || 0);
      if (!arr.length || (ultima && pagina >= ultima) || (!ultima && arr.length < 100)) break;
    } catch (e: any) { erro = String(e?.message || e); parcial = pagina > 1; break; }
  }
  cacheContatos = { em: Date.now(), lista: out, parcial, erro };
  return cacheContatos;
}

// Procura pelo número numa conexão (últimos 8 dígitos: pega com e sem o 9º dígito)
export async function buscarNaConexao(numero: string, serviceId: string): Promise<ContatoDigisac[]> {
  const dig = numero.replace(/\D/g, "").slice(-8);
  const q = new URLSearchParams({ "where[data.number][$iLike]": `%${dig}%`, "where[serviceId]": serviceId, "where[isGroup]": "false", perPage: "20" });
  return lista(await chamar(`/contacts?${q}`)).map(paraContato);
}

export async function criarContatoDigisac(numero: string, nome: string, serviceId: string): Promise<ContatoDigisac> {
  const j = await chamar(`/contacts`, { metodo: "POST", corpo: { name: nome, internalName: nome, number: numero, serviceId } });
  const c = j?.data?.id ? j.data : j;
  return paraContato({ ...c, data: c?.data ?? { number: numero }, serviceId: c?.serviceId ?? serviceId });
}

export async function renomearContatoDigisac(id: string, nome: string) {
  await chamar(`/contacts/${encodeURIComponent(id)}`, { metodo: "PUT", corpo: { internalName: nome } });
}
