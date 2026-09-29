"use client";
import { useEffect, useState } from "react";

// Janela "Mandar pro setor": a IA rascunha o chamado; você confere, escolhe a empresa e envia pro Acessórias
export default function MandarSetor({ conversaId, threadId, tarefaId, midias, anexosEmail, onFechar }: {
  conversaId?: string; threadId?: string; tarefaId?: string;
  midias?: { id: string; nome: string }[]; anexosEmail?: { chave: string; nome: string }[]; onFechar: (msg?: string) => void;
}) {
  const [deptos, setDeptos] = useState<{ ID: string; Nome: string }[]>([]);
  const [f, setF] = useState({ assunto: "", descricao: "", departamento: "", prioridade: 2, prazo: "" });
  const [empresa, setEmpresa] = useState<{ cnpj: string; razao: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<any[]>([]);
  const [totalEmp, setTotalEmp] = useState<number | null>(null);
  const [selMidias, setSelMidias] = useState<Set<string>>(new Set());
  const [selEmail, setSelEmail] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/setor/departamentos").then(r => r.json()).then(setDeptos).catch(() => {});
    fetch("/api/setor/empresas").then(r => r.json()).then(j => setTotalEmp(j.total ?? 0));
    fetch("/api/setor/rascunho", { method: "POST", body: JSON.stringify({ conversaId, threadId, tarefaId }) }).then(r => r.json()).then(j => {
      setCarregando(false);
      if (j.erro) { setErro("IA: " + j.erro); return; }
      setF(x => ({ ...x, assunto: j.assunto || "", descricao: j.descricao || "", prioridade: Number(j.prioridade ?? 2), departamento: j.setor || "" }));
      if (j.empresa?.cnpj) setEmpresa(j.empresa);
      else setBusca(j.empresa || j.busca || "");
    }).catch(e => { setCarregando(false); setErro(String(e)); });
  }, []);
  // setor sugerido pela IA vem por nome → troca pelo ID
  useEffect(() => {
    if (!deptos.length || !f.departamento || /^\d+$/.test(f.departamento)) return;
    const d = deptos.find(d => d.Nome.toLowerCase().includes(f.departamento.toLowerCase().slice(0, 5)));
    setF(x => ({ ...x, departamento: d ? d.ID : "" }));
  }, [deptos, f.departamento]);
  useEffect(() => {
    if (!busca.trim() || empresa) { setAchadas([]); return; }
    const t = setTimeout(() => fetch(`/api/setor/empresas?q=${encodeURIComponent(busca)}`).then(r => r.json()).then(j => setAchadas(j.empresas || [])), 250);
    return () => clearTimeout(t);
  }, [busca, empresa]);

  async function sincronizarEmpresas() {
    setTotalEmp(null);
    const j = await fetch("/api/setor/empresas-sync", { method: "POST" }).then(r => r.json());
    if (j.erro) setErro(j.erro);
    setTotalEmp(j.total ?? 0);
  }
  async function enviar() {
    if (!empresa) { setErro("Escolha a empresa."); return; }
    setEnviando(true); setErro("");
    const dep = deptos.find(d => d.ID === f.departamento);
    const j = await fetch("/api/setor/enviar", { method: "POST", body: JSON.stringify({
      ...f, empresa_cnpj: empresa.cnpj, empresa_nome: empresa.razao, departamento_nome: dep?.Nome,
      conversaId, threadId, tarefaId, midias: Array.from(selMidias), anexosEmail: Array.from(selEmail),
    }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setEnviando(false);
    if (j.erro) { setErro(j.erro); return; }
    onFechar(`Chamado #${j.solId} aberto no ${dep?.Nome || "setor"}${j.anexos ? ` com ${j.anexos} anexo(s)` : ""} ✓`);
  }

  return (
    <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-caixa" style={{ width: 620, maxHeight: "92vh", overflowY: "auto" }}>
        <b style={{ fontSize: 16 }}>➡️ Mandar pro setor (Acessórias)</b>
        {carregando && <p className="muted small">🤖 A IA está escrevendo o chamado…</p>}
        <label>Empresa
          {empresa
            ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="chip">{empresa.razao} · {empresa.cnpj}</span><button className="linkbtn" onClick={() => setEmpresa(null)}>trocar</button></div>
            : <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, fantasia ou CNPJ" />}
        </label>
        {!empresa && achadas.length > 0 && <div style={{ border: "1px solid var(--line)", borderRadius: 8, maxHeight: 180, overflowY: "auto" }}>
          {achadas.map(a => <div key={a.cnpj} className="dg-filtro" onClick={() => { setEmpresa({ cnpj: a.cnpj, razao: a.razao }); setAchadas([]); }}>{a.razao}{a.fantasia && a.fantasia !== a.razao ? ` (${a.fantasia})` : ""} <span className="muted small">{a.cnpj}</span></div>)}
        </div>}
        {totalEmp === 0 && <div className="aviso small">A lista de empresas ainda não foi trazida do Acessórias. <button className="linkbtn" onClick={sincronizarEmpresas}>Trazer agora</button> (leva ~1 min)</div>}
        {totalEmp === null && <p className="muted small">Trazendo empresas…</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label>Setor<select value={f.departamento} onChange={e => setF({ ...f, departamento: e.target.value })}>
            <option value="">— escolha —</option>{deptos.map(d => <option key={d.ID} value={d.ID}>{d.Nome}</option>)}</select></label>
          <label>Prioridade<select value={f.prioridade} onChange={e => setF({ ...f, prioridade: Number(e.target.value) })}>
            <option value={0}>Muito alta</option><option value={1}>Alta</option><option value={2}>Média</option><option value={3}>Baixa</option></select></label>
          <label>Prazo<input type="date" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} /></label>
        </div>
        <label>Assunto<input value={f.assunto} onChange={e => setF({ ...f, assunto: e.target.value })} /></label>
        <label>Descrição (o setor recebe exatamente isto)<textarea rows={8} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></label>
        {!!midias?.length && <div className="small"><b>Anexar arquivos da conversa:</b>{midias.map(m => <label key={m.id} style={{ display: "flex", gap: 6, fontWeight: 400 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={selMidias.has(m.id)} onChange={() => setSelMidias(s => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />{m.nome}</label>)}</div>}
        {!!anexosEmail?.length && <div className="small"><b>Anexar arquivos do e-mail:</b>{anexosEmail.map(a => <label key={a.chave} style={{ display: "flex", gap: 6, fontWeight: 400 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={selEmail.has(a.chave)} onChange={() => setSelEmail(s => { const n = new Set(s); n.has(a.chave) ? n.delete(a.chave) : n.add(a.chave); return n; })} />{a.nome}</label>)}</div>}
        {erro && <div className="aviso erro small">{erro}</div>}
        <div className="acoes" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          <button className="sec" onClick={() => onFechar()}>Cancelar</button>
          <button onClick={enviar} disabled={enviando || carregando || !f.departamento || !f.assunto || !f.descricao}>{enviando ? "Abrindo chamado…" : "Abrir chamado"}</button>
        </div>
      </div>
    </div>
  );
}
