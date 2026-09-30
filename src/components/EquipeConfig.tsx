"use client";
import { useState } from "react";

const SETORES: [string, string][] = [["DP", "Departamento Pessoal"], ["CONTABIL", "Contábil"], ["BPO", "BPO Financeiro"], ["FISCAL", "Fiscal"], ["LEGALIZACAO", "Legalização"], ["FINANCEIRO", "Financeiro Interno"], ["ATENDIMENTO", "Atendimento (Célula de Entrada)"]];

export default function EquipeConfig({ extId, clientOk, comChave }: { extId: string; clientOk: boolean; comChave: string[] }) {
  const [chaves, setChaves] = useState<Record<string, string>>({});
  async function gerar(setor: string) {
    if (comChave.includes(setor) && !confirm("Gerar chave nova? O painel desse setor vai precisar da chave nova.")) return;
    const j = await fetch("/api/painel/chave", { method: "POST", body: JSON.stringify({ setor }) }).then(r => r.json());
    if (j.chave) setChaves(c => ({ ...c, [setor]: j.chave }));
  }
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>A extensão da equipe entra com a <b>conta Google da Outtax</b> e descobre o setor pelos <b>grupos do Google</b> (dp@, contabilidade@, bpo@, fiscal@, legalizacao@, financas@, celula-entrada@ = Atendimento). Cada painel de setor mostra só as reuniões do setor dele.</p>
      <p className="small"><b>ID da extensão:</b> <code>{extId}</code></p>
      <p className="small"><b>Login Google da extensão:</b> {clientOk ? "🟢 configurado" : "🔴 falta EXT_OAUTH_CLIENT_ID na Vercel"}</p>
      <b className="small">Chave de cada painel</b>
      <table style={{ marginTop: 6 }}><tbody>
        {SETORES.map(([cod, nome]) => <tr key={cod}>
          <td>{nome}</td>
          <td className="small">{comChave.includes(cod) ? "✅ tem chave" : "—"}</td>
          <td><button className="mini" onClick={() => gerar(cod)}>{comChave.includes(cod) ? "Gerar nova" : "Gerar"}</button></td>
          <td style={{ maxWidth: 340, wordBreak: "break-all" }} className="small">{chaves[cod] ? <><code>{chaves[cod]}</code> <button className="linkbtn" onClick={() => navigator.clipboard.writeText(chaves[cod])}>copiar</button></> : null}</td>
        </tr>)}
      </tbody></table>
      <p className="muted small">A chave aparece só na hora. Ela vai na Vercel do painel do setor como <code>MESA_PAINEL_CHAVE</code>.</p>
    </div>
  );
}
