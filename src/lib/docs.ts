// Documentos anexados às tarefas: guardados no Supabase Storage (bucket mesa-docs) e lidos pela IA
import { dbGlobal } from "./db";

export const BUCKET = "mesa-docs";

export async function linkParaSubir(caminho: string) {
  const { data, error } = await dbGlobal().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error("Não consegui preparar o envio do arquivo: " + (error?.message || ""));
  return data.signedUrl;
}

export async function baixarDoc(caminho: string): Promise<Buffer> {
  const { data, error } = await dbGlobal().storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error("Arquivo não encontrado: " + (error?.message || caminho));
  return Buffer.from(await data.arrayBuffer());
}

export async function apagarDoc(caminho: string) { await dbGlobal().storage.from(BUCKET).remove([caminho]); }

// Transforma os documentos em "blocos" que a IA consegue ler (PDF e imagem direto; Word e texto viram texto)
export async function blocosParaIA(docs: { nome: string; mime: string | null; caminho: string }[]) {
  const blocos: any[] = [];
  for (const d of docs) {
    const mime = (d.mime || "").toLowerCase(); const nome = d.nome.toLowerCase();
    try {
      const bytes = await baixarDoc(d.caminho);
      if (mime.includes("pdf") || nome.endsWith(".pdf")) {
        blocos.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") }, title: d.nome });
      } else if (/^image\/(png|jpe?g|gif|webp)$/.test(mime)) {
        blocos.push({ type: "text", text: `Imagem anexada: ${d.nome}` });
        blocos.push({ type: "image", source: { type: "base64", media_type: mime === "image/jpg" ? "image/jpeg" : mime, data: bytes.toString("base64") } });
      } else if (nome.endsWith(".docx") || mime.includes("wordprocessingml")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: bytes });
        blocos.push({ type: "text", text: `Documento Word "${d.nome}":\n${value.slice(0, 120000)}` });
      } else if (mime.startsWith("text/") || /\.(txt|csv|md)$/.test(nome)) {
        blocos.push({ type: "text", text: `Arquivo "${d.nome}":\n${bytes.toString("utf8").slice(0, 120000)}` });
      } else {
        blocos.push({ type: "text", text: `(Arquivo "${d.nome}" anexado, mas esse formato não dá pra ler — prefira PDF, Word, imagem ou texto.)` });
      }
    } catch (e: any) { blocos.push({ type: "text", text: `(Não consegui abrir "${d.nome}": ${e?.message || e})` }); }
  }
  return blocos;
}

// ---------------- leitura do documento (uma vez, na hora de anexar) ----------------
// PDF (com texto ou escaneado) e imagem: a IA transcreve página por página. PDF grande é dividido em partes.
import { PDFDocument } from "pdf-lib";

const MODELO_LEITURA = () => process.env.ANTHROPIC_MODEL_LEITURA || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const LIMITE_PARTE = 8 * 1024 * 1024; // cada parte enviada à IA fica abaixo de ~8 MB

async function transcrever(bloco: any, rotulo: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO_LEITURA(), max_tokens: 16000,
      messages: [{ role: "user", content: [bloco, { type: "text", text: `Transcreva fielmente TODO o texto deste documento (${rotulo}), incluindo carimbos, etiquetas de registro da Junta, CNPJ, NIRE, datas e assinaturas identificáveis. Mantenha a estrutura (títulos, cláusulas, tabelas em texto). Não resuma, não comente, não invente — se um trecho estiver ilegível, escreva [ilegível].` }] }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `IA ${r.status}`);
  return (j.content || []).map((c: any) => c.text || "").join("");
}

export async function lerDocumento(bytes: Buffer, nome: string, mime: string | null): Promise<{ texto: string; paginas: number | null }> {
  const n = nome.toLowerCase(), m = (mime || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = pdf.getPageCount();
    // parte por parte: poucas páginas por vez quando o arquivo é pesado (escaneado)
    const porPagina = bytes.length / Math.max(total, 1);
    const passo = Math.max(1, Math.min(20, Math.floor(LIMITE_PARTE / Math.max(porPagina, 1))));
    const partes: string[] = [];
    for (let i = 0; i < total; i += passo) {
      const fim = Math.min(total, i + passo);
      let dados: Buffer = bytes;
      if (!(i === 0 && fim === total && bytes.length <= LIMITE_PARTE)) {
        const novo = await PDFDocument.create();
        const pags = await novo.copyPages(pdf, Array.from({ length: fim - i }, (_, k) => i + k));
        pags.forEach(p => novo.addPage(p));
        dados = Buffer.from(await novo.save());
      }
      const txt = await transcrever({ type: "document", source: { type: "base64", media_type: "application/pdf", data: dados.toString("base64") } }, `páginas ${i + 1} a ${fim} de ${total}`);
      partes.push(total > passo ? `--- páginas ${i + 1} a ${fim} ---\n${txt}` : txt);
    }
    return { texto: partes.join("\n\n"), paginas: total };
  }
  if (/^image\/(png|jpe?g|gif|webp)$/.test(m)) {
    const txt = await transcrever({ type: "image", source: { type: "base64", media_type: m === "image/jpg" ? "image/jpeg" : m, data: bytes.toString("base64") } }, "imagem");
    return { texto: txt, paginas: 1 };
  }
  if (n.endsWith(".docx") || m.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    return { texto: (await mammoth.extractRawText({ buffer: bytes })).value, paginas: null };
  }
  if (m.startsWith("text/") || /\.(txt|csv|md)$/.test(n)) return { texto: bytes.toString("utf8"), paginas: null };
  throw new Error("formato não suportado — use PDF, Word, imagem ou texto");
}

// Lê e guarda na tabela (status: lendo → lido | erro)
export async function processarDoc(sb: any, doc: { id: string; nome: string; mime: string | null; caminho: string }) {
  await sb.from("tarefa_docs").update({ status: "lendo", erro: null }).eq("id", doc.id);
  try {
    const { texto, paginas } = await lerDocumento(await baixarDoc(doc.caminho), doc.nome, doc.mime);
    if (!texto.trim()) throw new Error("não saiu texto nenhum do documento");
    await sb.from("tarefa_docs").update({ texto: texto.slice(0, 400000), paginas, status: "lido" }).eq("id", doc.id);
    return { status: "lido", paginas, caracteres: texto.length };
  } catch (e: any) {
    const erro = String(e?.message || e).slice(0, 300);
    await sb.from("tarefa_docs").update({ status: "erro", erro }).eq("id", doc.id);
    return { status: "erro", erro };
  }
}
