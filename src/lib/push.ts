// Notificações push (chegam no celular/computador mesmo com a Mesa fechada) — mesmo esquema do Painel DP
import webpush from "web-push";
import { db } from "./db";
import { lerConfig } from "./config";
import { donoAtual } from "./contexto";

let configurado = false;
function garantirConfig() {
  if (configurado) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados na Vercel.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:maiccon@outtax.com.br", pub, priv);
  configurado = true;
}
export const pushConfigurado = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export function horaSP() {
  return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
}

// tipo "mensagem" respeita o silêncio da noite; "agenda"/"prazo"/"resumo" sempre tocam
export async function notificar(titulo: string, corpo: string, url = "/", tag?: string, tipo: "mensagem" | "agenda" | "prazo" | "resumo" | "teste" = "mensagem") {
  if (!pushConfigurado()) return { enviadas: 0 };
  if (!donoAtual()) return { enviadas: 0 }; // sem sócio definido não avisa ninguém (evita avisar o sócio errado)
  if (tipo === "mensagem") {
    const cfg = await lerConfig();
    const h = horaSP();
    if (cfg.silencio_noite && (h >= 22 || h < 7)) return { enviadas: 0, silencio: true };
  }
  garantirConfig();
  const { data: assinaturas } = await db().from("push_assinaturas").select("*");
  let enviadas = 0;
  for (const a of assinaturas || []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ titulo, corpo: corpo.slice(0, 180), url, tag }), { TTL: 3600 });
      enviadas++;
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) await db().from("push_assinaturas").delete().eq("endpoint", a.endpoint);
    }
  }
  return { enviadas };
}

// Só avisa uma vez por chave (ex.: "agenda|<id do evento>")
export async function avisarUmaVez(chave: string, f: () => Promise<any>) {
  const { data, error } = await db().from("avisos_enviados").insert({ chave: `${donoAtual() || "*"}|${chave}` }).select("chave");
  if (error || !data?.length) return false; // já avisado
  await f();
  return true;
}
