"use client";
import { useEffect, useState } from "react";

// Janela "Gerar tarefa" a partir de um e-mail (a IA já sugere título e prazo)
export default function TarefaDeEmail({ threadId, onFechar }: { threadId: string; onFechar: (msg?: string) => void }) {
  const [f, setF] = useState({ titulo: "", tipo: "pedido", prazo: "", detalhe: "", quem: "", categoria: "trabalho", tirarDaLista: true });
  const [pensando, setPensando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch(`/api/email/tarefa?threadId=${threadId}`).then(r => r.json()).then(j => {
      setPensando(false);
      if (j.erro) return;
      const p = j.prazo ? new Date(j.prazo) : null;
      const local = p && !isNaN(p.getTime()) ? new Date(p.getTime() - 3 * 3600000).toISOString().slice(0, 16) : "";
      setF(x => ({ ...x, titulo: j.titulo || "", tipo: j.tipo || "pedido", prazo: local, detalhe: j.detalhe || "", quem: j.quem || "" }));
    }).catch(() => setPensando(false));
  }, [threadId]);
  async function salvar() {
    setSalvando(true); setErro("");
    const j = await fetch("/api/email/tarefa", { method: "POST", body: JSON.stringify({ ...f, threadId }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setSalvando(false);
    if (j.erro) { setErro(j.erro); return; }
    onFechar("Tarefa criada ✓" + (f.tirarDaLista ? " (e-mail saiu da lista)" : ""));
  }
  return (
    <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-caixa" style={{ width: 520 }}>
        <b style={{ fontSize: 16 }}>📌 Gerar tarefa do e-mail</b>
        {pensando && <p className="muted small">🤖 Sugerindo título e prazo…</p>}
        <label>O que fazer<input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} autoFocus /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label>Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
            <option value="pedido">Pedido</option><option value="promessa">Prometi</option><option value="reuniao">Reunião</option><option value="outro">Anotação</option></select></label>
          <label>Prazo<input type="datetime-local" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} /></label>
          <label>Categoria<select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>
            <option value="trabalho">💼 Trabalho</option><option value="pessoal">🏠 Pessoal</option></select></label>
        </div>
        <label>Quem<input value={f.quem} onChange={e => setF({ ...f, quem: e.target.value })} /></label>
        <label>Detalhe<input value={f.detalhe} onChange={e => setF({ ...f, detalhe: e.target.value })} /></label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={f.tirarDaLista} onChange={e => setF({ ...f, tirarDaLista: e.target.checked })} /> Tirar o e-mail de "esperando você" (agora é tarefa)</label>
        {erro && <div className="aviso erro small">{erro}</div>}
        <div className="acoes" style={{ justifyContent: "flex-end", marginTop: 6 }}>
          <button className="sec" onClick={() => onFechar()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !f.titulo.trim()}>{salvando ? "Salvando…" : "Criar tarefa"}</button>
        </div>
      </div>
    </div>
  );
}
