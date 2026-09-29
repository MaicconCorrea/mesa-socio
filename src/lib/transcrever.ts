// Transcrição de áudio do WhatsApp.
// 1ª opção: OpenAI (OPENAI_API_KEY) — qualquer duração, muito preciso, ~R$ 0,03 por minuto.
// 2ª opção: Google Speech-to-Text com a conta de serviço do DP — áudios de até 1 minuto (precisa ativar a API no Google Cloud).
import { db } from "./db";
import { baixarMidia } from "./evolution";
import { googleConfigurado, tokenServico } from "./google";

export const transcricaoConfigurada = () => !!process.env.OPENAI_API_KEY || googleConfigurado();
export const motorTranscricao = () => process.env.OPENAI_API_KEY ? "OpenAI" : googleConfigurado() ? "Google (até 1 min)" : "nenhum";

async function viaOpenAI(bytes: Buffer, mime: string) {
  const form = new FormData();
  const ext = mime.includes("mpeg") ? "mp3" : mime.includes("mp4") ? "m4a" : mime.includes("webm") ? "webm" : "ogg";
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime.split(";")[0] }), `audio.${ext}`);
  form.append("model", process.env.OPENAI_TRANSCRICAO || "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  // vocabulário do escritório (ajuda a acertar nomes próprios e siglas)
  form.append("prompt", process.env.VOCABULARIO_TRANSCRICAO || "Outtax, Maiccon, Acessórias, Digisac, Domínio, Onvio, eSocial, DCTFWeb, FGTS Digital, Simples Nacional, DAS, PGDAS, ISS, ICMS, NFS-e, e-CAC, SERPRO, pró-labore, holerite, folha de pagamento, pré-nota, certidão, CND, alvará, contrato social, BPO financeiro, Nibo, Conexa, Supabase, Vercel, Evolution, WhatsApp, Google Meet.");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return String(j.text || "").trim();
}

async function viaGoogle(bytes: Buffer, mime = "audio/ogg") {
  const token = await tokenServico();
  const webm = mime.includes("webm");
  const r = await fetch("https://speech.googleapis.com/v1/speech:recognize", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ config: { encoding: webm ? "WEBM_OPUS" : "OGG_OPUS", sampleRateHertz: webm ? 48000 : 16000, languageCode: "pt-BR", enableAutomaticPunctuation: true, model: "latest_long" },
      audio: { content: bytes.toString("base64") } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const t = JSON.stringify(j);
    if (/has not been used|disabled/i.test(t)) throw new Error("Ative a Cloud Speech-to-Text API no Google Cloud (ou coloque OPENAI_API_KEY na Vercel).");
    if (/too long|exceeds|1 minute/i.test(t)) throw new Error("Áudio maior que 1 minuto: o Google só transcreve até 1 min. Coloque OPENAI_API_KEY na Vercel.");
    throw new Error(`Google Speech ${r.status}: ${t.slice(0, 200)}`);
  }
  return (j.results || []).map((x: any) => x.alternatives?.[0]?.transcript || "").join(" ").trim();
}

// Transcreve um arquivo de áudio qualquer (usado pelo gravador de reuniões)
export async function transcreverBytes(bytes: Buffer, mime: string): Promise<string> {
  return process.env.OPENAI_API_KEY ? viaOpenAI(bytes, mime) : viaGoogle(bytes, mime);
}

export async function transcreverMensagem(mensagemId: string): Promise<string> {
  const sb = db();
  const { data: m } = await sb.from("mensagens").select("id,msg_id,conversa_id,midia_mime,texto").eq("id", mensagemId).single();
  if (!m) throw new Error("mensagem não encontrada");
  const { data: c } = await sb.from("conversas").select("instancia").eq("id", m.conversa_id).single();
  const arq = await baixarMidia(c?.instancia || "", m.msg_id);
  if (!arq) throw new Error("A Evolution não devolveu o áudio.");
  const mime = m.midia_mime || arq.mime || "audio/ogg";
  let texto = "";
  try {
    texto = process.env.OPENAI_API_KEY ? await viaOpenAI(arq.bytes, mime) : await viaGoogle(arq.bytes);
  } catch (e: any) {
    await sb.from("mensagens").update({ transcricao_erro: String(e.message).slice(0, 300) }).eq("id", m.id);
    throw e;
  }
  texto = texto || "(áudio sem fala reconhecível)";
  await sb.from("mensagens").update({ transcricao: texto, transcricao_erro: null, texto: `[áudio] ${texto}`.slice(0, 4000) }).eq("id", m.id);
  return texto;
}

// Cron: transcreve os áudios novos (últimas 48h) antes da IA analisar a conversa
export async function transcreverPendentes(limite = 8) {
  if (!transcricaoConfigurada()) return { transcritos: 0 };
  const sb = db();
  const { data } = await sb.from("mensagens").select("id,conversa_id,de_mim,me_citou").eq("tipo", "audio").is("transcricao", null).is("transcricao_erro", null)
    .gte("enviada_em", new Date(Date.now() - 48 * 3600000).toISOString()).order("enviada_em", { ascending: false }).limit(limite * 4);
  // grupos do escritório: só áudio seu ou que fala com você (o resto é com o time)
  const ids = Array.from(new Set((data || []).map(m => m.conversa_id)));
  const { data: cs } = await sb.from("conversas").select("id,modo").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const modo = new Map((cs || []).map(c => [c.id, c.modo]));
  const fila = (data || []).filter(m => modo.get(m.conversa_id) !== "ignorada" && (modo.get(m.conversa_id) !== "grupo" || m.de_mim || m.me_citou)).slice(0, limite);
  let transcritos = 0;
  for (const m of fila) { try { await transcreverMensagem(m.id); transcritos++; } catch { /* erro fica gravado */ } }
  return { transcritos };
}
