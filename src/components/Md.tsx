// Mostra texto com formatação simples (títulos, **negrito**, listas e tabelas) — como no chat do Claude
import React from "react";

function inline(t: string, k: string) {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <b key={k + i}>{p.slice(2, -2)}</b>
      : p.startsWith("`") && p.endsWith("`") ? <code key={k + i} style={{ background: "var(--superficie-2)", padding: "0 4px", borderRadius: 4 }}>{p.slice(1, -1)}</code>
      : <React.Fragment key={k + i}>{p}</React.Fragment>);
}

export default function Md({ texto, tamanho = 13.5 }: { texto: string; tamanho?: number }) {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\s*\|.*\|\s*$/.test(l)) { // tabela
      const rows: string[][] = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) {
        const cel = linhas[i].trim().slice(1, -1).split("|").map(c => c.trim());
        if (!cel.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cel);
        i++;
      }
      out.push(<div key={"t" + i} style={{ overflowX: "auto", margin: "6px 0" }}><table style={{ borderCollapse: "collapse", fontSize: tamanho - 1 }}><tbody>
        {rows.map((r, a) => <tr key={a}>{r.map((c, b) => a === 0
          ? <th key={b} style={{ border: "1px solid var(--linha)", padding: "4px 8px", background: "var(--superficie-2)", textAlign: "left" }}>{inline(c, `h${a}${b}`)}</th>
          : <td key={b} style={{ border: "1px solid var(--linha)", padding: "4px 8px" }}>{inline(c, `c${a}${b}`)}</td>)}</tr>)}
      </tbody></table></div>);
      continue;
    }
    if (/^#{1,3}\s+/.test(l)) {
      const n = (l.match(/^#+/) || [""])[0].length;
      out.push(<div key={i} style={{ fontWeight: 700, fontSize: tamanho + (n === 1 ? 3 : n === 2 ? 1.5 : 0.5), margin: "8px 0 2px", color: "var(--navy)" }}>{inline(l.replace(/^#+\s+/, ""), "h" + i)}</div>);
    } else if (/^\s*[-*•]\s+/.test(l)) {
      out.push(<div key={i} style={{ paddingLeft: 16, textIndent: -10 }}>• {inline(l.replace(/^\s*[-*•]\s+/, ""), "l" + i)}</div>);
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      out.push(<div key={i} style={{ paddingLeft: 18, textIndent: -14 }}>{inline(l.trim(), "n" + i)}</div>);
    } else if (/^-{3,}$/.test(l.trim())) {
      out.push(<hr key={i} style={{ border: 0, borderTop: "1px solid var(--line)", margin: "8px 0" }} />);
    } else if (!l.trim()) {
      out.push(<div key={i} style={{ height: 6 }} />);
    } else out.push(<div key={i}>{inline(l, "p" + i)}</div>);
    i++;
  }
  return <div style={{ fontSize: tamanho, lineHeight: 1.5 }}>{out}</div>;
}
