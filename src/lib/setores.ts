// Setores da Outtax = grupos do Google Workspace. Quem está no grupo grava reuniões daquele setor.
import { ESCOPOS, contaAdmin, tokenGoogle } from "./google";

export const SETORES: Record<string, { codigo: string; nome: string }> = {
  "dp@outtax.com.br": { codigo: "DP", nome: "Departamento Pessoal" },
  "contabilidade@outtax.com.br": { codigo: "CONTABIL", nome: "Contábil" },
  "bpo@outtax.com.br": { codigo: "BPO", nome: "BPO Financeiro" },
  "fiscal@outtax.com.br": { codigo: "FISCAL", nome: "Fiscal" },
  "legalizacao@outtax.com.br": { codigo: "LEGALIZACAO", nome: "Legalização" },
  "financas@outtax.com.br": { codigo: "FINANCEIRO", nome: "Financeiro Interno" },
  // Célula de Entrada (atendimento). Troque o e-mail do grupo aqui se o time estiver em outro grupo.
  [(process.env.GRUPO_ATENDIMENTO || "celula-entrada@outtax.com.br").toLowerCase()]: { codigo: "ATENDIMENTO", nome: "Atendimento (Célula de Entrada)" },
};
export const NOME_SETOR: Record<string, string> = Object.fromEntries(Object.values(SETORES).map(s => [s.codigo, s.nome]).concat([["SOCIOS", "Sócios (só eu)"]]));
const socios = () => (process.env.SOCIOS || "maiccon@outtax.com.br,marcos@outtax.com.br").split(",").map(s => s.trim().toLowerCase());

const cache = new Map<string, { em: number; setores: { codigo: string; nome: string }[] }>();
export async function setoresDoUsuario(email: string) {
  const e = email.toLowerCase();
  const c = cache.get(e); if (c && Date.now() - c.em < 10 * 60000) return c.setores;
  const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/groups?userKey=${encodeURIComponent(e)}&maxResults=200`, {
    headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.grupos, contaAdmin())}` }, cache: "no-store",
  });
  if (!r.ok) throw new Error(`Não consegui ler os grupos do Google (${r.status}). Falta o escopo admin.directory.group.readonly na delegação.`);
  const j = await r.json();
  const setores = (j.groups || []).map((g: any) => SETORES[String(g.email).toLowerCase()]).filter(Boolean);
  if (socios().includes(e)) setores.unshift({ codigo: "SOCIOS", nome: "Sócios (só eu)" });
  cache.set(e, { em: Date.now(), setores });
  return setores as { codigo: string; nome: string }[];
}
