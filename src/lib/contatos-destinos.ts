// Contatos em 3 destinos: Mesa (tabela contatos), Google Contatos (vai para a agenda do celular e o WhatsApp
// mostra o nome) e Digisac (na conexão Atendimento ou BPO escolhida). Cruza tudo pelo número (com e sem o 9º dígito).
// A mesma função salva um contato (botão "Criar contato" no WhatsApp) ou vários (tela Contatos).
import { db, dbGlobal } from "./db";
import { donoAtual } from "./contexto";
import { ESCOPOS, googleConfigurado, minhaConta, tokenGoogle } from "./google";
import { limparCacheContatos, normalizarBR } from "./contatos";
import { listarContatos } from "./evolution";
import { minhasInstancias } from "./numeros";
import {
  buscarNaConexao, conexoesDigisac, contatosDigisac, criarContatoDigisac, digisacConfigurado,
  limparCacheDigisac, renomearContatoDigisac,
} from "./digisac";
import {
  AVISO_DIGISAC, AVISO_GOOGLE_ESCOPO, CATEGORIAS, LOTE_CONTATOS_MAX, resumoVazio,
  type Categoria, type ChaveConexao, type ConexaoEscolhida, type ItemContato, type ResumoContatos,
} from "./contatos-comum";

const rotuloGoogle = (c: Categoria) => `Outtax · ${c}`;

// ---------- números ----------
// Formas do mesmo celular BR: com e sem o 9º dígito
export function variantes(numero: string): string[] {
  const n = normalizarBR(numero);
  if (!n.startsWith("55")) return [n];
  if (n.length === 13 && n[4] === "9") return [n, n.slice(0, 4) + n.slice(5)];
  if (n.length === 12 && /[6-9]/.test(n[4])) return [n, n.slice(0, 4) + "9" + n.slice(4)];
  return [n];
}
// E.164 (sem o "+"): celular sempre com o 9º dígito
export function canonico(numero: string): string {
  const n = normalizarBR(numero);
  return n.startsWith("55") && n.length === 12 && /[6-9]/.test(n[4]) ? n.slice(0, 4) + "9" + n.slice(4) : n;
}
export function formatarNumero(numero: string): string {
  const n = canonico(numero);
  if (/^55\d{10,11}$/.test(n)) { const ddd = n.slice(2, 4), r = n.slice(4); return `+55 (${ddd}) ${r.slice(0, r.length - 4)}-${r.slice(-4)}`; }
  return "+" + n;
}
const semAcento = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
function indexar<T>(itens: { numero: string; v: T }[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const i of itens) for (const k of variantes(i.numero)) if (k.length >= 12 && !m.has(k)) m.set(k, i.v);
  return m;
}
const achar = <T,>(m: Map<string, T>, numero: string) => { for (const k of variantes(numero)) { const v = m.get(k); if (v !== undefined) return v; } return undefined; };

function erroDePermissao(msg: string) { return /autoriz|unauthorized|PERMISSION_DENIED|insufficient|scope|403/i.test(msg); }

// ---------- Google Contatos (leitura com cache curto) ----------
type ContatoGoogle = { nome: string; resource: string };
const cacheGoogle = new Map<string, { em: number; mapa: Map<string, ContatoGoogle>; status: string }>();
export function limparCacheGoogle() { cacheGoogle.delete(minhaConta()); }

export async function contatosGoogle(): Promise<{ mapa: Map<string, ContatoGoogle>; status: string }> {
  if (!googleConfigurado()) return { mapa: new Map(), status: "desligado" };
  const conta = minhaConta();
  const c = cacheGoogle.get(conta);
  if (c && Date.now() - c.em < 3 * 60000) return c;
  const itens: { numero: string; v: ContatoGoogle }[] = [];
  let status = "ok";
  try {
    let token = "";
    try { token = await tokenGoogle(ESCOPOS.contatos, conta); } catch { token = await tokenGoogle(ESCOPOS.contatosEscrever, conta); }
    let pagina = "";
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ personFields: "names,phoneNumbers", pageSize: "1000", ...(pagina ? { pageToken: pagina } : {}) });
      const r = await fetch(`https://people.googleapis.com/v1/people/me/connections?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) { status = r.status === 403 ? AVISO_GOOGLE_ESCOPO : `erro ${r.status}`; break; }
      const j = await r.json();
      for (const p of j.connections || []) for (const t of p.phoneNumbers || [])
        itens.push({ numero: String(t.canonicalForm || t.value || ""), v: { nome: p.names?.[0]?.displayName || "", resource: p.resourceName } });
      pagina = j.nextPageToken; if (!pagina) break;
    }
  } catch (e: any) { const m = String(e?.message || e); status = erroDePermissao(m) ? AVISO_GOOGLE_ESCOPO : m.slice(0, 160); }
  const novo = { em: Date.now(), mapa: indexar(itens), status };
  if (status === "ok") cacheGoogle.set(conta, novo);
  return novo;
}

// Rótulos (contactGroups) "Outtax · Categoria": acha ou cria
const cacheRotulos = new Map<string, Map<string, string>>();
async function rotuloGoogleId(token: string, nome: string): Promise<string> {
  const conta = minhaConta();
  let m = cacheRotulos.get(conta);
  if (!m) {
    m = new Map();
    const r = await fetch("https://people.googleapis.com/v1/contactGroups?pageSize=1000", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`Google rótulos ${r.status}: ${(await r.text()).slice(0, 150)}`);
    for (const g of (await r.json()).contactGroups || []) if (g.groupType === "USER_CONTACT_GROUP") m.set(semAcento(g.name || g.formattedName || ""), g.resourceName);
    cacheRotulos.set(conta, m);
  }
  const achado = m.get(semAcento(nome)); if (achado) return achado;
  const r = await fetch("https://people.googleapis.com/v1/contactGroups", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contactGroup: { name: nome } }),
  });
  if (!r.ok) throw new Error(`Google: não criou o rótulo "${nome}" (${r.status}): ${(await r.text()).slice(0, 150)}`);
  const g = await r.json();
  m.set(semAcento(nome), g.resourceName);
  return g.resourceName;
}

// ---------- Lista para a tela Contatos ----------
export type LinhaContato = {
  numero: string; formatado: string; conversaIds: string[]; instancias: string[];
  sugerido: string; pushName: string; empresa: string;
  ultimaEm: string | null; ultimaTexto: string;
  mesa: string | null; google: string | null; digisac: { nome: string; conexao: string }[];
};
export type ListaContatos = {
  linhas: LinhaContato[];
  google: string;
  digisac: { configurado: boolean; erro?: string; parcial: boolean; aviso?: string };
  conexoes: { chave: ChaveConexao; nome: string }[];
  conexoesErro?: string;
};

const cachePush = new Map<string, { em: number; mapa: Map<string, string> }>();
async function pushNames(): Promise<Map<string, string>> {
  const dono = donoAtual() || "-";
  const c = cachePush.get(dono); if (c && Date.now() - c.em < 10 * 60000) return c.mapa;
  const itens: { numero: string; v: string }[] = [];
  for (const inst of await minhasInstancias()) {
    try { for (const k of await listarContatos(inst)) if (k.nome && !/^\+?\d[\d\s()-]*$/.test(k.nome)) itens.push({ numero: k.jid.split("@")[0], v: k.nome }); } catch { /* segue */ }
  }
  const mapa = indexar(itens);
  cachePush.set(dono, { em: Date.now(), mapa });
  return mapa;
}

export async function montarListaContatos(recarregar = false): Promise<ListaContatos> {
  if (recarregar) { limparCacheGoogle(); limparCacheDigisac(); cachePush.delete(donoAtual() || "-"); }
  const sb = db();
  const insts = await minhasInstancias();
  const [convR, mesaR, google, digisac, conexoes, push] = await Promise.all([
    insts.length
      ? sb.from("conversas").select("id,instancia,jid,nome,empresa_cnpj,ultima_msg_em,ultima_msg_texto").eq("is_grupo", false).neq("modo", "ignorada").eq("ignorada", false)
          .in("instancia", insts).like("jid", "%@s.whatsapp.net").order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(5000)
      : Promise.resolve({ data: [] as any[] }),
    sb.from("contatos").select("numero,nome").limit(10000).then((r: any) => r, () => ({ data: [] })),
    contatosGoogle(),
    digisacConfigurado() ? contatosDigisac() : Promise.resolve({ lista: [], parcial: false, erro: AVISO_DIGISAC }),
    conexoesDigisac(),
    pushNames(),
  ]);
  const convs: any[] = (convR as any).data || [];
  const mesa = indexar<string>(((mesaR as any).data || []).map((c: any) => ({ numero: String(c.numero), v: String(c.nome || "") })));
  const nomesServico = new Map<string, string>(conexoes.lista.map(c => [c.id, c.nome]));
  const dgItens = new Map<string, { nome: string; conexao: string }[]>();
  for (const c of digisac.lista) for (const k of variantes(c.numero)) {
    const arr = dgItens.get(k) || [];
    if (!arr.some(x => x.nome === c.nome && x.conexao === (nomesServico.get(c.serviceId || "") || ""))) arr.push({ nome: c.nome, conexao: nomesServico.get(c.serviceId || "") || "" });
    dgItens.set(k, arr);
  }
  // empresas ligadas às conversas
  const cnpjs = Array.from(new Set(convs.map(c => c.empresa_cnpj).filter(Boolean)));
  const empresas = new Map<string, string>();
  if (cnpjs.length) {
    const { data } = await dbGlobal().from("empresas").select("cnpj,razao,fantasia").in("cnpj", cnpjs.slice(0, 500));
    for (const e of data || []) empresas.set(e.cnpj, e.fantasia || e.razao || "");
  }
  const porNumero = new Map<string, LinhaContato>();
  for (const c of convs) {
    const bruto = String(c.jid).split("@")[0];
    const n = canonico(bruto);
    if (!/^\d{12,13}$/.test(n)) continue;
    let l = porNumero.get(n);
    if (!l) {
      const nomeConv = c.nome && !/^\+?\(?\d[\d\s()+-]*$/.test(c.nome) ? String(c.nome) : "";
      const dg = (() => { for (const k of variantes(n)) { const v = dgItens.get(k); if (v?.length) return v; } return []; })();
      const pushName = achar(push, n) || nomeConv;
      const empresa = c.empresa_cnpj ? empresas.get(c.empresa_cnpj) || "" : "";
      const dgNome = dg.find(x => x.nome && !/^\+?\d[\d\s()-]*$/.test(x.nome))?.nome || "";
      l = {
        numero: n, formatado: formatarNumero(n), conversaIds: [], instancias: [],
        sugerido: pushName || dgNome || empresa, pushName, empresa,
        ultimaEm: c.ultima_msg_em || null, ultimaTexto: String(c.ultima_msg_texto || "").slice(0, 120),
        mesa: achar(mesa, n) ?? null, google: achar(google.mapa, n)?.nome ?? null, digisac: dg,
      };
      porNumero.set(n, l);
    }
    l.conversaIds.push(c.id);
    if (!l.instancias.includes(c.instancia)) l.instancias.push(c.instancia);
    if (!l.empresa && c.empresa_cnpj) l.empresa = empresas.get(c.empresa_cnpj) || "";
  }
  return {
    linhas: Array.from(porNumero.values()),
    google: google.status,
    digisac: { configurado: digisacConfigurado(), erro: digisac.erro, parcial: digisac.parcial, aviso: digisacConfigurado() ? undefined : AVISO_DIGISAC },
    conexoes: conexoes.lista.map(c => ({ chave: c.chave, nome: c.nome })),
    conexoesErro: conexoes.erro,
  };
}

// ---------- Salvar ----------
type Situacao = "ok" | "ja" | "atualizado" | "pulado" | "erro" | "sem-conexao" | "desligado";
export type ResultadoContato = { numero: string; nome: string; mesa: Situacao; google: Situacao; digisac: Situacao; erros: string[] };

export function validarItens(v: unknown): ItemContato[] {
  if (!Array.isArray(v)) throw new Error("Seleção inválida.");
  if (!v.length) throw new Error("Nenhum contato selecionado.");
  if (v.length > LOTE_CONTATOS_MAX) throw new Error(`No máximo ${LOTE_CONTATOS_MAX} contatos por vez.`);
  return v.map((x: any) => ({
    numero: String(x?.numero ?? "").replace(/\D/g, "").slice(0, 15),
    nome: String(x?.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    categoria: String(x?.categoria ?? "") as Categoria,
    conexao: String(x?.conexao ?? "") as ConexaoEscolhida,
    empresa: x?.empresa ? String(x.empresa).trim().slice(0, 120) : undefined,
  }));
}

// Salva cada contato nos 3 destinos, um por vez, sem duplicar. Um destino com erro não impede os outros.
export async function salvarContatos(itens: ItemContato[]): Promise<{ resumo: ResumoContatos; resultados: ResultadoContato[] }> {
  const dono = donoAtual();
  if (!dono) throw new Error("Não deu para confirmar de quem são os contatos. Entre de novo.");
  const resumo = resumoVazio();
  const resultados: ResultadoContato[] = [];
  const aviso = (a: string) => { if (!resumo.avisos.includes(a)) resumo.avisos.push(a); };

  // Estado atual de cada destino (para não duplicar)
  const sb = db();
  const { data: mesaAtual } = await sb.from("contatos").select("numero,nome").limit(10000);
  const mesa = indexar(((mesaAtual as any[]) || []).map(c => ({ numero: c.numero, v: { numero: String(c.numero), nome: String(c.nome || "") } })));
  limparCacheGoogle();
  const google = await contatosGoogle();
  let googleBloqueado = !googleConfigurado() ? "desligado" : google.status !== "ok" ? google.status : "";
  if (googleBloqueado === "desligado") aviso("Google Contatos desligado (falta GOOGLE_SERVICE_ACCOUNT_JSON na Vercel).");
  else if (googleBloqueado) aviso(erroDePermissao(googleBloqueado) || googleBloqueado === AVISO_GOOGLE_ESCOPO ? AVISO_GOOGLE_ESCOPO : `Google Contatos: ${googleBloqueado}`);
  const conexoes = digisacConfigurado() ? await conexoesDigisac() : { lista: [], erro: AVISO_DIGISAC };
  let tokenEscrita = "";

  for (const it of itens) {
    const r: ResultadoContato = { numero: it.numero, nome: it.nome, mesa: "pulado", google: "pulado", digisac: "pulado", erros: [] };
    resultados.push(r);
    const falha = (destino: string, e: unknown) => { const m = `${destino}: ${String((e as any)?.message || e).slice(0, 200)}`; r.erros.push(m); resumo.erros.push({ numero: it.numero, nome: it.nome, erro: m }); };
    const n = canonico(it.numero);
    if (!/^\d{12,13}$/.test(n)) { falha("Número", "inválido — use DDD + número"); continue; }
    if (!it.nome) { falha("Nome", "digite o nome do contato"); continue; }
    if (!CATEGORIAS.includes(it.categoria)) { falha("Categoria", "escolha a categoria"); continue; }
    if (!["atendimento", "bpo", "nao"].includes(it.conexao)) { falha("Digisac", "escolha a conexão (Atendimento, BPO ou Não cadastrar)"); continue; }

    // a) Mesa — igual ao "Criar contato": guarda o nome e troca o nome das conversas desse número
    try {
      const atual = achar(mesa, n);
      if (atual && semAcento(atual.nome) === semAcento(it.nome)) { r.mesa = "ja"; resumo.mesa.ja++; }
      else {
        const numeroMesa = atual?.numero || normalizarBR(n);
        let { error } = await sb.from("contatos").upsert({ numero: numeroMesa, nome: it.nome, categoria: it.categoria }, { onConflict: "dono,numero" });
        if (error && /categoria/i.test(error.message)) ({ error } = await sb.from("contatos").upsert({ numero: numeroMesa, nome: it.nome }, { onConflict: "dono,numero" }));
        if (error) throw new Error(error.message);
        for (const k of variantes(n)) mesa.set(k, { numero: numeroMesa, nome: it.nome });
        r.mesa = "ok"; resumo.mesa.ok++;
      }
      await sb.from("conversas").update({ nome: it.nome }).in("jid", variantes(n).map(v => `${v}@s.whatsapp.net`)).eq("is_grupo", false);
    } catch (e) { r.mesa = "erro"; resumo.mesa.erro++; falha("Mesa", e); }

    // b) Google Contatos (no rótulo da categoria)
    if (googleBloqueado) { r.google = "desligado"; resumo.google.desligado++; }
    else if (achar(google.mapa, n)) { r.google = "ja"; resumo.google.ja++; }
    else {
      try {
        if (!tokenEscrita) tokenEscrita = await tokenGoogle(ESCOPOS.contatosEscrever, minhaConta());
        const grupo = await rotuloGoogleId(tokenEscrita, rotuloGoogle(it.categoria));
        const resp = await fetch("https://people.googleapis.com/v1/people:createContact", {
          method: "POST", headers: { Authorization: `Bearer ${tokenEscrita}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            names: [{ givenName: it.nome }],
            phoneNumbers: [{ value: "+" + n, type: "mobile" }],
            ...(it.empresa ? { organizations: [{ name: it.empresa }] } : {}),
            memberships: [{ contactGroupMembership: { contactGroupResourceName: grupo } }],
          }),
        });
        if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0, 160)}`);
        const p = await resp.json().catch(() => ({}));
        for (const k of variantes(n)) google.mapa.set(k, { nome: it.nome, resource: p.resourceName || "" });
        r.google = "ok"; resumo.google.ok++;
      } catch (e: any) {
        const m = String(e?.message || e);
        r.google = "erro"; resumo.google.erro++;
        if (erroDePermissao(m)) { googleBloqueado = AVISO_GOOGLE_ESCOPO; aviso(AVISO_GOOGLE_ESCOPO); }
        else falha("Google", m);
      }
    }

    // c) Digisac (só na conexão escolhida)
    if (it.conexao === "nao") { r.digisac = "sem-conexao"; resumo.digisac.semConexao++; }
    else if (!digisacConfigurado()) { r.digisac = "desligado"; resumo.digisac.desligado++; aviso(AVISO_DIGISAC); }
    else {
      const cx = conexoes.lista.find(c => c.chave === it.conexao);
      if (!cx) { r.digisac = "erro"; resumo.digisac.erro++; falha("Digisac", `conexão ${it.conexao === "bpo" ? "BPO" : "Atendimento"} não encontrada (cadastre DIGISAC_SERVICE_${it.conexao.toUpperCase()} na Vercel)`); }
      else {
        try {
          const iguais = (await buscarNaConexao(n, cx.id)).filter(c => variantes(c.numero).some(v => variantes(n).includes(v)));
          const existente = iguais[0];
          if (!existente) { await criarContatoDigisac(n, it.nome, cx.id); r.digisac = "ok"; resumo.digisac.ok++; }
          else if (semAcento(existente.nome) === semAcento(it.nome)) { r.digisac = "ja"; resumo.digisac.ja++; }
          else {
            resumo.digisac.ja++;
            try { await renomearContatoDigisac(existente.id, it.nome); r.digisac = "atualizado"; resumo.digisac.atualizados++; }
            catch (e: any) { r.digisac = "ja"; falha("Digisac", `já existia como "${existente.nome || "sem nome"}" e não deu para trocar o nome (${String(e?.message || e).slice(0, 120)})`); }
          }
        } catch (e) { r.digisac = "erro"; resumo.digisac.erro++; falha("Digisac", e); }
      }
    }
  }
  limparCacheContatos(); limparCacheGoogle(); limparCacheDigisac();
  return { resumo, resultados };
}
