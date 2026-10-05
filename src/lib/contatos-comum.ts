// Tipos e textos dos Contatos que servem tanto no servidor quanto na tela (sem nada de servidor aqui).
export const CATEGORIAS = ["Cliente", "Fornecedor", "Equipe", "Pessoal", "Outro"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type ChaveConexao = "atendimento" | "bpo";
export type ConexaoEscolhida = ChaveConexao | "nao";
export const LOTE_CONTATOS_MAX = 100;
export const AVISO_GOOGLE_ESCOPO = "Libere o escopo https://www.googleapis.com/auth/contacts na delegação do Google Workspace";
export const AVISO_DIGISAC = "Cadastre DIGISAC_BASE_URL e DIGISAC_TOKEN na Vercel";

export type ItemContato = { numero: string; nome: string; categoria: Categoria; conexao: ConexaoEscolhida; empresa?: string };

export type ResumoContatos = {
  mesa: { ok: number; ja: number; erro: number };
  google: { ok: number; ja: number; erro: number; desligado: number };
  digisac: { ok: number; ja: number; atualizados: number; semConexao: number; erro: number; desligado: number };
  erros: { numero: string; nome: string; erro: string }[];
  avisos: string[];
};
export const resumoVazio = (): ResumoContatos => ({
  mesa: { ok: 0, ja: 0, erro: 0 }, google: { ok: 0, ja: 0, erro: 0, desligado: 0 },
  digisac: { ok: 0, ja: 0, atualizados: 0, semConexao: 0, erro: 0, desligado: 0 }, erros: [], avisos: [],
});

// "Mesa 12 · Google 11 (1 já existia) · Digisac 8 (2 já existiam, 2 sem conexão)"
export function textoResumo(r: ResumoContatos): string {
  const ja = (n: number) => (n ? `${n} ${n === 1 ? "já existia" : "já existiam"}` : "");
  const partes = (xs: string[]) => { const f = xs.filter(Boolean); return f.length ? ` (${f.join(", ")})` : ""; };
  return [
    `Mesa ${r.mesa.ok}${partes([ja(r.mesa.ja), r.mesa.erro ? `${r.mesa.erro} com erro` : ""])}`,
    `Google ${r.google.ok}${partes([ja(r.google.ja), r.google.erro ? `${r.google.erro} com erro` : "", r.google.desligado ? `${r.google.desligado} sem acesso` : ""])}`,
    `Digisac ${r.digisac.ok}${partes([ja(r.digisac.ja), r.digisac.atualizados ? `${r.digisac.atualizados} com nome atualizado` : "", r.digisac.semConexao ? `${r.digisac.semConexao} sem conexão` : "", r.digisac.erro ? `${r.digisac.erro} com erro` : "", r.digisac.desligado ? `${r.digisac.desligado} não configurado` : ""])}`,
  ].join(" · ");
}

export function somarResumos(a: ResumoContatos, b: ResumoContatos): ResumoContatos {
  const s = <T extends Record<string, number>>(x: T, y: T) => Object.fromEntries(Object.keys(x).map(k => [k, x[k] + (y[k] || 0)])) as T;
  return {
    mesa: s(a.mesa, b.mesa), google: s(a.google, b.google), digisac: s(a.digisac, b.digisac),
    erros: [...a.erros, ...b.erros], avisos: Array.from(new Set([...a.avisos, ...b.avisos])),
  };
}
