"use client";
import { useEffect, useRef, useState } from "react";

type N = { instancia: string; nome: string; estado: string; webhook: boolean };

// Cada sócio cadastra, nomeia, conecta (QR Code) e remove os próprios números de WhatsApp
export default function MeusNumeros() {
  const [lista, setLista] = useState<N[] | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const [qr, setQr] = useState<{ instancia: string; nome: string; img: string | null; estado: string } | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const timer = useRef<any>(null);

  async function carregar() {
    const j = await fetch("/api/numeros").then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setErro(j.erro); return; }
    setLista(j.numeros); setNomes(Object.fromEntries(j.numeros.map((n: N) => [n.instancia, n.nome])));
  }
  useEffect(() => { carregar(); return () => clearInterval(timer.current); }, []);

  async function abrirQr(n: { instancia: string; nome: string }) {
    setQr({ ...n, img: null, estado: "carregando" });
    const ler = async () => {
      const j = await fetch(`/api/numeros/qr?instancia=${encodeURIComponent(n.instancia)}`).then(r => r.json()).catch(() => null);
      if (!j) return;
      setQr(q => q && q.instancia === n.instancia ? { ...q, img: j.qr || q.img, estado: j.estado } : q);
      if (j.estado === "open") { clearInterval(timer.current); setTimeout(() => { setQr(null); carregar(); }, 1500); }
    };
    clearInterval(timer.current); await ler(); timer.current = setInterval(ler, 5000);
  }
  function fecharQr() { clearInterval(timer.current); setQr(null); carregar(); }

  async function adicionar() {
    if (!novo.trim()) return;
    setCriando(true); setErro("");
    const j = await fetch("/api/numeros", { method: "POST", body: JSON.stringify({ nome: novo }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setCriando(false);
    if (j.erro) { setErro(j.erro); return; }
    const nome = novo; setNovo(""); await carregar(); abrirQr({ instancia: j.instancia, nome });
  }
  async function renomear(inst: string) {
    await fetch("/api/numeros", { method: "PATCH", body: JSON.stringify({ instancia: inst, nome: nomes[inst] }) });
    carregar();
  }
  async function religar(inst: string) {
    const j = await fetch("/api/numeros", { method: "PATCH", body: JSON.stringify({ instancia: inst, religar: true }) }).then(r => r.json());
    if (j.erro) setErro(j.erro); carregar();
  }
  async function remover(n: N) {
    if (!confirm(`Remover o número "${n.nome}"? Ele é desconectado da Mesa. As conversas antigas continuam no histórico.`)) return;
    await fetch("/api/numeros", { method: "DELETE", body: JSON.stringify({ instancia: n.instancia }) });
    carregar();
  }

  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Seus números aparecem só para você. Trocou de chip ou o número caiu? <b>Remova</b> o antigo e <b>adicione</b> o novo.</p>
      {erro && <div className="aviso erro small">{erro}</div>}
      {lista === null ? <p className="muted small">Carregando…</p> : (
        <table><thead><tr><th>Nome</th><th>Conexão</th><th>Mesa ouvindo</th><th></th></tr></thead>
          <tbody>
            {!lista.length && <tr><td colSpan={4} className="muted small">Nenhum número ainda. Adicione abaixo.</td></tr>}
            {lista.map(n => (
              <tr key={n.instancia}>
                <td><div style={{ display: "flex", gap: 6 }}>
                  <input value={nomes[n.instancia] ?? ""} onChange={e => setNomes({ ...nomes, [n.instancia]: e.target.value })} style={{ maxWidth: 170 }} />
                  {nomes[n.instancia] !== n.nome && <button className="mini" onClick={() => renomear(n.instancia)}>Salvar</button>}
                </div></td>
                <td>{n.estado === "open" ? "🟢 conectado" : n.estado === "connecting" ? "🟡 aguardando QR" : `🔴 ${n.estado}`}</td>
                <td>{n.webhook ? "🟢 sim" : <button className="mini sec" onClick={() => religar(n.instancia)}>Ligar</button>}</td>
                <td><div className="acoes">
                  {n.estado !== "open" && <button className="mini" onClick={() => abrirQr(n)}>Conectar (QR)</button>}
                  <button className="mini perigo" onClick={() => remover(n)}>Remover</button>
                </div></td>
              </tr>
            ))}
          </tbody></table>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nome do número novo (ex.: Comercial, Pessoal, Outtax)" onKeyDown={e => { if (e.key === "Enter") adicionar(); }} />
        <button onClick={adicionar} disabled={criando || !novo.trim()} style={{ whiteSpace: "nowrap" }}>{criando ? "Criando…" : "+ Adicionar número"}</button>
      </div>

      {qr && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) fecharQr(); }}>
        <div className="modal-caixa" style={{ width: 380, textAlign: "center" }}>
          <b style={{ fontSize: 16 }}>Conectar "{qr.nome}"</b>
          {qr.estado === "open" ? <p style={{ color: "var(--verde)", fontWeight: 700 }}>✅ Conectado!</p> : <>
            <p className="small" style={{ textAlign: "left" }}>No celular desse número: WhatsApp → <b>⋮</b> (ou Configurações no iPhone) → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> → aponte para o código.</p>
            {qr.img ? <img src={qr.img} alt="QR Code" style={{ width: 260, height: 260, margin: "0 auto" }} /> : <p className="muted">Gerando o código…</p>}
            <p className="muted small">O código muda sozinho a cada poucos segundos. Esta janela fecha quando conectar.</p>
          </>}
          <button className="sec" onClick={fecharQr}>Fechar</button>
        </div>
      </div>}
    </div>
  );
}
