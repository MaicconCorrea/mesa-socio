// Contatos do sócio: Google (agenda do celular), criados na Mesa, WhatsApp (Evolution) e quem já conversou.
// "salvo" = está no Google Contatos ou foi criado pela Mesa (tem nome de verdade).
import { db } from "./db";
import { listarContatos } from "./evolution";
import { minhasInstancias } from "./numeros";
import { donoAtual } from "./contexto";
import { ESCOPOS, googleConfigurado, tokenGoogle, minhaConta } from "./google";

export type Contato = { numero: string; nome: string; foto: string | null; fonte: string; salvo?: boolean; conversas: { id: string; instancia: string }[] };
export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");
export const semAcento = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function normalizarBR(n: string) {
  let d = soDigitos(n);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

// Cache em memória (a lista de contatos muda pouco)
const caches = new Map<string, { em: number; lista: Contato[]; google: string }>();

export async function montar(): Promise<{ lista: Contato[]; google: string }> {
  const dono = donoAtual() || "-";
  const cache = caches.get(dono);
  if (cache && Date.now() - cache.em < 10 * 60000) return cache;
  const mapa = new Map<string, Contato>();
  const add = (numero: string, nome: string, foto: string | null, fonte: string) => {
    const n = normalizarBR(numero); if (n.length < 12) return;
    const c = mapa.get(n) || { numero: n, nome: "", foto: null, fonte, conversas: [] };
    if (nome && (!c.nome || /^\+?\d/.test(c.nome) || fonte === "google" || fonte === "mesa")) c.nome = nome;
    if (nome && (fonte === "google" || fonte === "mesa")) c.salvo = true;
    if (foto && !c.foto) c.foto = foto;
    if (!mapa.has(n)) c.fonte = fonte;
    mapa.set(n, c);
  };
  // 1) Contatos do Google (agenda sincronizada do celular)
  let google = "desligado";
  if (googleConfigurado()) {
    try {
      let token = "", pagina = "";
      for (let i = 0; i < 10; i++) {
        const q = new URLSearchParams({ personFields: "names,phoneNumbers", pageSize: "1000", ...(pagina ? { pageToken: pagina } : {}) });
        const r = await fetch(`https://people.googleapis.com/v1/people/me/connections?${q}`, { headers: { Authorization: `Bearer ${token || (token = await tokenGoogle(ESCOPOS.contatos))}` } });
        if (!r.ok) { google = `erro ${r.status}`; break; }
        const j = await r.json();
        for (const p of j.connections || []) for (const t of p.phoneNumbers || []) add(t.canonicalForm || t.value, p.names?.[0]?.displayName || "", null, "google");
        google = "ok";
        pagina = j.nextPageToken; if (!pagina) break;
      }
    } catch (e: any) { google = String(e?.message || e).slice(0, 120); }
  }
  // 1b) Contatos criados na própria Mesa (botão "Criar contato")
  try {
    const { data: meus } = await db().from("contatos").select("numero,nome").limit(5000);
    for (const c of meus || []) add(c.numero, c.nome, null, "mesa");
  } catch { /* tabela ainda não criada */ }
  // 2) Contatos do WhatsApp (Evolution), por número
  for (const inst of await minhasInstancias()) {
    try { for (const c of await listarContatos(inst)) add(c.jid.split("@")[0], c.nome, c.foto, "whatsapp"); } catch { /* segue */ }
  }
  // 3) Quem já conversou com você
  const { data: cs } = await db().from("conversas").select("id,instancia,jid,nome,foto_url").eq("is_grupo", false).neq("instancia", "gchat").neq("modo", "ignorada").limit(3000);
  for (const c of cs || []) {
    const n = normalizarBR(String(c.jid).split("@")[0]);
    add(n, c.nome && !/^\(?\d/.test(c.nome) ? c.nome : "", c.foto_url, "conversa");
    mapa.get(n)?.conversas.push({ id: c.id, instancia: c.instancia });
  }
  const novo = { em: Date.now(), lista: Array.from(mapa.values()), google };
  caches.set(dono, novo);
  return novo;
}


export function limparCacheContatos() { caches.delete(donoAtual() || "-"); }

export async function estaSalvo(numero: string): Promise<boolean> {
  const n = normalizarBR(numero);
  if (n.length < 12) return true; // número estranho (LID etc.): não oferece o botão
  const { lista } = await montar();
  // celular BR pode vir com ou sem o 9 na frente
  const sem9 = n.length === 13 ? n.slice(0, 4) + n.slice(5) : n;
  const com9 = n.length === 12 ? n.slice(0, 4) + "9" + n.slice(4) : n;
  return lista.some(c => c.salvo && (c.numero === n || c.numero === sem9 || c.numero === com9));
}

// Cria no Google Contatos (vai pro celular) e sempre guarda na Mesa.
export async function criarContato(numero: string, nome: string): Promise<{ google: boolean; aviso?: string }> {
  const n = normalizarBR(numero);
  await db().from("contatos").upsert({ numero: n, nome }, { onConflict: "dono,numero" });
  let google = false, aviso: string | undefined;
  if (googleConfigurado()) {
    try {
      const token = await tokenGoogle(ESCOPOS.contatosEscrever, minhaConta());
      const r = await fetch("https://people.googleapis.com/v1/people:createContact", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ names: [{ givenName: nome }], phoneNumbers: [{ value: "+" + n, type: "mobile" }] }),
      });
      google = r.ok;
      if (!r.ok) aviso = `Google Contatos: ${(await r.text()).slice(0, 150)}`;
    } catch (e: any) { aviso = String(e?.message || e); }
  }
  limparCacheContatos();
  return { google, aviso };
}
