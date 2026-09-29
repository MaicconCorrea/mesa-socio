// "Como o Maiccon escreve": exemplos reais das mensagens que ele mandou + descrição da Configuração
import { db } from "./db";
import { lerConfig } from "./config";

let cache: { em: number; txt: string } | null = null;
export async function estiloDoMaiccon(): Promise<string> {
  if (cache && Date.now() - cache.em < 10 * 60000) return cache.txt;
  const cfg: any = await lerConfig();
  const { data } = await db().from("mensagens").select("texto").eq("de_mim", true).not("texto", "like", "[%")
    .order("enviada_em", { ascending: false }).limit(300);
  const vistos = new Set<string>();
  const exemplos: string[] = [];
  for (const m of data || []) {
    const t = String(m.texto || "").trim();
    if (t.length < 4 || t.length > 220 || vistos.has(t.toLowerCase()) || /^https?:/.test(t)) continue;
    vistos.add(t.toLowerCase()); exemplos.push(t);
    if (exemplos.length >= 40) break;
  }
  const txt = [
    `COMO O MAICCON ESCREVE NO WHATSAPP (imite o jeito, não copie as frases):`,
    cfg.estilo_escrita ? `Descrição dele: ${cfg.estilo_escrita}` : "",
    exemplos.length ? `Mensagens reais que ele mandou:\n${exemplos.map(e => `- ${e}`).join("\n")}` : "",
    `Regras: mensagens curtas e diretas, tom próximo e educado, sem formalidade de e-mail, sem asteriscos, sem emojis em excesso. Quebre em linhas curtas como ele faz.`,
  ].filter(Boolean).join("\n");
  cache = { em: Date.now(), txt };
  return txt;
}
