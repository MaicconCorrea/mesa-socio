import { lerConfig } from "./config";
import { montarResumo } from "./resumo";
import { notificar } from "./push";
import { enviarTextoCitando, instancias } from "./evolution";
import { enviarEmail } from "./gmail";
import { googleConfigurado, minhaConta } from "./google";

// Manda o resumo pelos canais ligados na Configuração
export async function enviarResumo(periodo: "manha" | "tarde") {
  const cfg = await lerConfig();
  const r = await montarResumo(periodo);
  const feito: string[] = [];
  const erros: string[] = [];
  if (cfg.resumo_push) { try { const x = await notificar(r.titulo.replace(/\*/g, ""), r.curto, "/resumo", "resumo", "resumo"); feito.push(`push (${x.enviadas})`); } catch (e: any) { erros.push("push: " + e.message); } }
  if (cfg.resumo_email && googleConfigurado()) {
    try {
      await enviarEmail(minhaConta(), "Mesa do Sócio", { para: minhaConta(), assunto: `${r.titulo.replace(/\*/g, "")} — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, corpo: r.texto.replace(/\*/g, "") });
      feito.push("e-mail");
    } catch (e: any) { erros.push("e-mail: " + e.message); }
  }
  const para = String(cfg.resumo_whats_para || "").replace(/\D/g, "");
  if (para) {
    try {
      const de = cfg.resumo_whats_de && instancias().includes(cfg.resumo_whats_de) ? cfg.resumo_whats_de : instancias()[0];
      const numero = para.length <= 11 ? "55" + para : para;
      await enviarTextoCitando(de, `${numero}@s.whatsapp.net`, r.texto, null);
      feito.push("WhatsApp");
    } catch (e: any) { erros.push("WhatsApp: " + e.message); }
  }
  return { feito, erros, texto: r.texto };
}
