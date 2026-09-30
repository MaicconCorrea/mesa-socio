import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instancias, listarContatos } from "@/lib/evolution";
import { ESCOPOS, googleConfigurado, tokenGoogle } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Contato = { numero: string; nome: string; foto: string | null; fonte: string; conversas: { id: string; instancia: string }[] };
const soDigitos = (s: string) => (s || "").replace(/\D/g, "");
const semAcento = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function normalizarBR(n: string) {
  let d = soDigitos(n);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

// Cache em memória (a lista de contatos muda pouco)
let cache: { em: number; lista: Contato[]; google: string } | null = null;

async function montar(): Promise<{ lista: Contato[]; google: string }> {
  if (cache && Date.now() - cache.em < 10 * 60000) return cache;
  const mapa = new Map<string, Contato>();
  const add = (numero: string, nome: string, foto: string | null, fonte: string) => {
    const n = normalizarBR(numero); if (n.length < 12) return;
    const c = mapa.get(n) || { numero: n, nome: "", foto: null, fonte, conversas: [] };
    if (nome && (!c.nome || /^\+?\d/.test(c.nome) || fonte === "google")) c.nome = nome;
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
  // 2) Contatos do WhatsApp (Evolution), por número
  for (const inst of instancias()) {
    try { for (const c of await listarContatos(inst)) add(c.jid.split("@")[0], c.nome, c.foto, "whatsapp"); } catch { /* segue */ }
  }
  // 3) Quem já conversou com você
  const { data: cs } = await db().from("conversas").select("id,instancia,jid,nome,foto_url").eq("is_grupo", false).neq("instancia", "gchat").neq("modo", "ignorada").limit(3000);
  for (const c of cs || []) {
    const n = normalizarBR(String(c.jid).split("@")[0]);
    add(n, c.nome && !/^\(?\d/.test(c.nome) ? c.nome : "", c.foto_url, "conversa");
    mapa.get(n)?.conversas.push({ id: c.id, instancia: c.instancia });
  }
  cache = { em: Date.now(), lista: Array.from(mapa.values()), google };
  return cache;
}

export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const { lista, google } = await montar();
  const t = semAcento(q), d = soDigitos(q);
  const achados = lista.filter(c => !q || (d.length >= 3 && c.numero.includes(d)) || (t.length >= 2 && semAcento(c.nome).includes(t)))
    .sort((a, b) => (b.conversas.length - a.conversas.length) || (Number(!!b.nome) - Number(!!a.nome)) || a.nome.localeCompare(b.nome))
    .slice(0, 40);
  return NextResponse.json({ contatos: achados, total: lista.length, google });
}
