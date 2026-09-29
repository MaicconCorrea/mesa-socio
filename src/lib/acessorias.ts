// Cliente da API do Acessórias (mesmo do Painel DP) — https://api.acessorias.com (Bearer, 100 req/min)
const BASE = "https://api.acessorias.com";
const headers = () => ({ Authorization: `Bearer ${process.env.ACESSORIAS_TOKEN}` });
export const acessoriasConfigurado = () => !!process.env.ACESSORIAS_TOKEN;

export async function listarEmpresas(pagina = 1): Promise<any[]> {
  const r = await fetch(`${BASE}/companies/ListAll?ativa=S&Pagina=${pagina}`, { headers: headers(), cache: "no-store" });
  if (r.status === 204) return [];
  if (!r.ok) throw new Error(`Acessórias ${r.status} ao listar empresas`);
  const j = await r.json();
  if (j?.Erro) throw new Error(`Acessórias: ${j.Erro}`);
  return Array.isArray(j) ? j : [];
}

export async function listarDepartamentos(): Promise<Array<{ ID: string; Nome: string }>> {
  const r = await fetch(`${BASE}/departments/ListAll`, { headers: headers(), cache: "no-store" });
  return r.ok ? r.json() : [];
}

export async function buscarSolicitacao(id: string): Promise<any | null> {
  const r = await fetch(`${BASE}/requests/${encodeURIComponent(id)}`, { headers: headers(), cache: "no-store" });
  if (r.status === 204 || !r.ok) return null;
  const j = await r.json();
  return Array.isArray(j) ? (j[0] ?? null) : (j?.SolID ? j : null);
}

// prioridade: 0=Muito alta, 1=Alta, 2=Média, 3=Baixa
export async function criarSolicitacao(d: { assunto: string; empresa: string; departamento: string; descricao: string; prioridade?: number; prazo?: string | null; arquivos?: { nome: string; bytes: Buffer; mime?: string }[] }): Promise<string> {
  const form = new FormData();
  form.append("assunto", d.assunto.slice(0, 100)); form.append("empresa", d.empresa); form.append("departamento", d.departamento);
  form.append("prioridade", String(d.prioridade ?? 2)); form.append("descricao", d.descricao); form.append("tipo", "E");
  if (d.prazo) form.append("data_prazo", d.prazo);
  for (const a of (d.arquivos ?? []).slice(0, 10)) form.append("arquivo[]", new Blob([new Uint8Array(a.bytes)], { type: a.mime || "application/octet-stream" }), a.nome);
  const r = await fetch(`${BASE}/requests`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(120000) });
  const t = await r.text(); let j: any = {}; try { j = JSON.parse(t); } catch { j = { Erro: t.slice(0, 300) || `HTTP ${r.status}` }; }
  if (j.Erro) throw new Error(`Acessórias: ${j.Erro}`);
  if (!j.id) throw new Error("Acessórias não devolveu o número da solicitação.");
  return String(j.id);
}
