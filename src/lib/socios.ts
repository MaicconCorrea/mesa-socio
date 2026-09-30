// Sócios que usam a Mesa (tabela socios). Nome usado nas telas, nas mensagens da IA e na assinatura.
import { dbGlobal } from "./db";
import { donoAtual } from "./contexto";

type Socio = { email: string; nome: string; primeiro: string };
let cache: { em: number; lista: Socio[] } | null = null;
export async function listarSocios(): Promise<Socio[]> {
  if (cache && Date.now() - cache.em < 5 * 60000) return cache.lista;
  const { data } = await dbGlobal().from("socios").select("email,nome").eq("ativo", true);
  const lista = (data || []).map((s: any) => ({ email: String(s.email).toLowerCase(), nome: s.nome || s.email, primeiro: String(s.nome || s.email).split(/[\s@]/)[0] }));
  cache = { em: Date.now(), lista };
  return lista;
}
export async function socioAtual(): Promise<Socio> {
  const d = donoAtual() || (process.env.MEU_EMAIL || "maiccon@outtax.com.br").toLowerCase();
  const s = (await listarSocios()).find(x => x.email === d);
  return s || { email: d, nome: d.split("@")[0], primeiro: d.split("@")[0].replace(/^./, c => c.toUpperCase()) };
}
// Troca "Maiccon" nos textos da IA pelo sócio da vez
export async function personalizar(txt: string) {
  const s = await socioAtual();
  return s.primeiro.toLowerCase() === "maiccon" ? txt : txt.replace(/Maiccon Correa/g, s.nome).replace(/Maiccon/g, s.primeiro);
}
