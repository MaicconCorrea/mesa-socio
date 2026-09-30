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
// Troca "Maiccon" nos textos da IA pelo sócio da vez.
// Só troca o que é NOSSO (instruções e rótulos). Texto de cliente/reunião/e-mail passa por blindar() antes,
// senão "Maiccon, vê isso?" num grupo em comum virava "Marcos, vê isso?" na Mesa do Marcos.
export async function personalizar(txt: string) {
  const s = await socioAtual();
  if (s.primeiro.toLowerCase() === "maiccon") return txt;
  return txt.replace(/Maiccon Correa/g, s.nome).replace(/Maiccon/g, s.primeiro).replace(/MAICCON/g, s.primeiro.toUpperCase());
}
// Protege nomes dentro de texto de terceiros (mensagens, transcrições, e-mails) contra o personalizar().
// Coloca um caractere invisível no meio do nome: a IA continua lendo "Maiccon", a troca não acontece.
export function blindar(txt?: string | null): string {
  return String(txt ?? "").replace(/mai+c+o+[nm]/gi, x => x[0] + "\u2060" + x.slice(1));
}
