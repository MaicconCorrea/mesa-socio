"use client";
import { useEffect, useState } from "react";

export default function EstiloIA({ motor }: { motor: string }) {
  const [cfg, setCfg] = useState<any>(null);
  const [txt, setTxt] = useState("");
  const [ok, setOk] = useState("");
  useEffect(() => { fetch("/api/config").then(r => r.json()).then(c => { setCfg(c); setTxt(c.estilo_escrita || ""); }); }, []);
  async function salvar(p: any) { setCfg((c: any) => ({ ...c, ...p })); await fetch("/api/config", { method: "POST", body: JSON.stringify(p) }); setOk("Salvo ✓"); setTimeout(() => setOk(""), 2500); }
  if (!cfg) return <p className="muted">Carregando…</p>;
  return (
    <div className="card">
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={!!cfg.sugestao_auto} onChange={e => salvar({ sugestao_auto: e.target.checked })} />
        💡 Deixar uma resposta sugerida pronta em cada conversa (aparece em cima do campo de mensagem)
      </label>
      <label style={{ marginTop: 8 }}>✍️ Meu jeito de escrever (a IA imita isso + as mensagens que você já mandou)
        <textarea rows={4} value={txt} onChange={e => setTxt(e.target.value)}
          placeholder={'Ex.: mensagens curtas, várias linhas; chamo cliente de "minha amiga"/"meu amigo"; uso "show", "sem problemas", "combinado"; não uso "prezado"; assino só "Maiccon" no e-mail.'} />
      </label>
      <div className="acoes" style={{ marginTop: 6 }}><button onClick={() => salvar({ estilo_escrita: txt })}>Salvar</button>{ok && <span className="small" style={{ color: "var(--verde)" }}>{ok}</span>}</div>
      <p className="small" style={{ marginTop: 10 }}><b>🎤 Transcrição de áudio:</b> {motor === "nenhum" ? "🔴 desligada" : `🟢 ${motor}`}</p>
      {motor !== "OpenAI" && <p className="muted small">Para transcrever áudios de qualquer tamanho (recomendado): crie uma chave em <b>platform.openai.com → API keys</b> e cadastre na Vercel como <code>OPENAI_API_KEY</code>. Custa em torno de R$ 0,03 por minuto de áudio. Sem ela, a Mesa usa o Google (só áudios de até 1 min, e precisa ativar a "Cloud Speech-to-Text API" no Google Cloud).</p>}
    </div>
  );
}
