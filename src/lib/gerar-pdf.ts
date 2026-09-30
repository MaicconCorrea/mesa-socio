// Texto da IA (títulos com #, listas com -, **negrito**) → PDF A4 formatado (fonte Helvetica, sem arquivos externos)
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

const A4 = { w: 595.28, h: 841.89 }, MARGEM = 70, LARG = A4.w - MARGEM * 2;
// a fonte padrão do PDF só tem os caracteres latinos; troca os que ela não conhece
const limpar = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
  .replace(/[•●]/g, "-").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

// largura real desenhada (letra por letra — a medida padrão desconta um ajuste entre letras que o desenho não aplica)
const larg = (f: PDFFont, t: string, tam: number) => Array.from(t).reduce((s, c) => s + f.widthOfTextAtSize(c, tam), 0);

type Pedaco = { t: string; negrito: boolean };
const pedacos = (linha: string, negritoBase: boolean): Pedaco[] =>
  linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p => p.startsWith("**") && p.endsWith("**") ? { t: p.slice(2, -2), negrito: true } : { t: p.replace(/\*/g, ""), negrito: negritoBase });

export async function gerarPdf(titulo: string, texto: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpar(titulo));
  const normal = await pdf.embedFont(StandardFonts.Helvetica), negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pag = pdf.addPage([A4.w, A4.h]); let y = A4.h - MARGEM;
  const novaPagina = () => { pag = pdf.addPage([A4.w, A4.h]); y = A4.h - MARGEM; };

  // escreve um parágrafo com quebra de linha automática (e justificado quando pedido)
  function paragrafo(ps: Pedaco[], tam: number, opc: { centro?: boolean; recuo?: number; justificar?: boolean; antes?: number; depois?: number } = {}) {
    const alt = tam * 1.45, largLinha = LARG - (opc.recuo || 0);
    y -= opc.antes || 0;
    const palavras: { t: string; f: PDFFont }[] = [];
    for (const p of ps) for (const w of limpar(p.t).split(/(\s+)/).filter(x => x && !/^\s+$/.test(x))) palavras.push({ t: w, f: p.negrito ? negrito : normal });
    const linhas: { t: string; f: PDFFont }[][] = []; let atual: { t: string; f: PDFFont }[] = [], w = 0;
    const esp = normal.widthOfTextAtSize(" ", tam);
    for (const p of palavras) {
      const pw = larg(p.f, p.t, tam);
      if (atual.length && w + esp + pw > largLinha) { linhas.push(atual); atual = []; w = 0; }
      w += (atual.length ? esp : 0) + pw; atual.push(p);
    }
    if (atual.length) linhas.push(atual);
    linhas.forEach((ln, i) => {
      if (y - alt < MARGEM) novaPagina();
      const total = ln.reduce((s, p) => s + larg(p.f, p.t, tam), 0);
      const ultima = i === linhas.length - 1;
      const gap = opc.justificar && !ultima && ln.length > 1 ? (largLinha - total) / (ln.length - 1) : esp;
      let x = MARGEM + (opc.recuo || 0) + (opc.centro ? (largLinha - total - esp * (ln.length - 1)) / 2 : 0);
      for (const p of ln) { pag.drawText(p.t, { x, y: y - tam, size: tam, font: p.f, color: rgb(0.1, 0.1, 0.12) }); x += larg(p.f, p.t, tam) + gap; }
      y -= alt;
    });
    y -= opc.depois || 0;
  }

  let temTitulo = false;
  for (const bruta of texto.replace(/\r/g, "").split("\n")) {
    const l = bruta.trimEnd();
    if (!l.trim() || /^-{3,}$/.test(l.trim())) { y -= 6; continue; }
    if (/^#\s+/.test(l)) { temTitulo = true; paragrafo(pedacos(l.replace(/^#\s+/, ""), true), 14, { centro: true, antes: 4, depois: 10 }); }
    else if (/^##\s+/.test(l)) paragrafo(pedacos(l.replace(/^##\s+/, ""), true), 11.5, { antes: 10, depois: 4 });
    else if (/^###\s+/.test(l)) paragrafo(pedacos(l.replace(/^###\s+/, ""), true), 11, { antes: 6, depois: 2 });
    else if (/^\s*[-•]\s+/.test(l)) paragrafo([{ t: "-  ", negrito: false }, ...pedacos(l.replace(/^\s*[-•]\s+/, ""), false)], 10.5, { recuo: 14, justificar: true, depois: 2 });
    else paragrafo(pedacos(l, false), 10.5, { justificar: true, depois: 5 });
  }
  if (!temTitulo) { /* sem título no texto: põe o nome no topo da primeira página */
    const p1 = pdf.getPage(0), t = limpar(titulo), w = negrito.widthOfTextAtSize(t, 14);
    p1.drawText(t, { x: (A4.w - w) / 2, y: A4.h - MARGEM + 24, size: 14, font: negrito });
  }
  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => { const t = `Página ${i + 1} de ${total}`; p.drawText(limpar(t), { x: (A4.w - normal.widthOfTextAtSize(limpar(t), 8.5)) / 2, y: 36, size: 8.5, font: normal, color: rgb(0.4, 0.4, 0.45) }); });
  return Buffer.from(await pdf.save());
}
