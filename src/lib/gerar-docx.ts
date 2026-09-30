// Texto da IA (títulos com #, listas com -, **negrito**) → arquivo Word (.docx) formatado
import { AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

function trechos(linha: string, base: { bold?: boolean; size?: number } = {}) {
  const partes = linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return partes.map(p => p.startsWith("**") && p.endsWith("**")
    ? new TextRun({ text: p.slice(2, -2), bold: true, size: base.size, font: "Arial" })
    : new TextRun({ text: p.replace(/\*/g, ""), bold: base.bold, size: base.size, font: "Arial" }));
}

export async function gerarDocx(titulo: string, texto: string): Promise<Buffer> {
  const paras: (Paragraph | Table)[] = [];
  const linhas = texto.replace(/\r/g, "").split("\n");
  let temTitulo = false;
  const borda = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  for (let idx = 0; idx < linhas.length; idx++) {
    const l = linhas[idx].trimEnd();
    if (/^\s*\|.*\|\s*$/.test(l)) { // tabela markdown
      const rows: string[][] = [];
      while (idx < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[idx])) {
        const cel = linhas[idx].trim().slice(1, -1).split("|").map(c => c.trim());
        if (!cel.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cel);
        idx++;
      }
      idx--;
      const ncol = Math.max(...rows.map(r => r.length));
      paras.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, a) => new TableRow({ children: Array.from({ length: ncol }, (_, b) => new TableCell({
        borders: { top: borda, bottom: borda, left: borda, right: borda },
        children: [new Paragraph({ children: trechos(r[b] || "", { bold: a === 0, size: 20 }) })] })) })) }));
      paras.push(new Paragraph({ text: "" }));
      continue;
    }
    if (!l.trim() || /^-{3,}$/.test(l.trim())) { paras.push(new Paragraph({ text: "" })); continue; }
    if (/^#\s+/.test(l)) {
      temTitulo = true;
      paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: trechos(l.replace(/^#\s+/, ""), { bold: true, size: 28 }) }));
    } else if (/^##\s+/.test(l)) {
      paras.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: trechos(l.replace(/^##\s+/, ""), { bold: true, size: 24 }) }));
    } else if (/^###\s+/.test(l)) {
      paras.push(new Paragraph({ spacing: { before: 160, after: 80 }, children: trechos(l.replace(/^###\s+/, ""), { bold: true, size: 22 }) }));
    } else if (/^\s*[-•]\s+/.test(l)) {
      paras.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, children: trechos(l.replace(/^\s*[-•]\s+/, ""), { size: 22 }) }));
    } else {
      paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 300 }, children: trechos(l, { size: 22 }) }));
    }
  }
  if (!temTitulo) paras.unshift(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: titulo, bold: true, size: 28, font: "Arial" })] }));
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 18, font: "Arial" })] })] }) },
      children: paras,
    }],
  });
  return Packer.toBuffer(doc);
}
