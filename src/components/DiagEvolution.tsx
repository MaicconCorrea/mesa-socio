"use client";
import { useEffect, useState } from "react";

// O que a Evolution guardou por último em cada número (pra conferir se algo não chegou na Mesa)
export default function DiagEvolution() {
  const [d, setD] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const ler = () => fetch("/api/diagnostico/evolution").then(r => r.json()).then(j => { if (j.erro) setErro(j.erro); else setD(j); }).catch(e => setErro(String(e)));
  useEffect(() => { ler(); }, []);
  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!d) return <p className="muted small">Consultando a Evolution…</p>;
  return <>
    <button className="sec mini" onClick={() => { setD(null); ler(); }}>↻ Atualizar</button>
    {d.map(n => (
      <div key={n.instancia} style={{ marginTop: 10 }}>
        <b>📱 {n.numero}</b>
        <table style={{ marginTop: 4 }}><thead><tr><th>Quando</th><th>De mim?</th><th>remoteJid</th><th>Alternativo</th><th>Tipo</th></tr></thead>
          <tbody>{n.mensagens.map((m: any, i: number) => <tr key={i}>
            <td>{new Date(m.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
            <td>{m.deMim ? "✅ sim" : "não"}</td><td style={{ fontSize: 12 }}>{m.remoteJid}</td><td style={{ fontSize: 12 }}>{m.alternativo}</td><td style={{ fontSize: 12 }}>{m.tipo}</td>
          </tr>)}</tbody></table>
      </div>
    ))}
  </>;
}
