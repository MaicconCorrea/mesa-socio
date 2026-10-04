"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // aviso vindo do login único do Painel Outtax (/api/auth/portal)
  useEffect(() => { const m = new URLSearchParams(window.location.search).get("erro"); if (m) setErro(m); }, []);

  async function entrar() {
    setErro(""); setCarregando(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro("E-mail ou senha incorretos."); return; }
    window.location.href = "/";
  }

  return (
    <div className="login-wrap" style={{ margin: -28 }}>
      <div className="login-card">
        <img src="/logo-cor.png" alt="Outtax" className="logo-claro" style={{ height: 30, marginBottom: 14 }} />
        <img src="/logo-branco.png" alt="Outtax" className="logo-escuro" style={{ height: 30, marginBottom: 14 }} />
        <h1 style={{ fontSize: 20 }}>Mesa do Sócio</h1>
        <p className="sub">Seu WhatsApp, tarefas e compromissos num lugar só.</p>
        <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus /></label>
        <label style={{ marginTop: 10 }}>Senha<input value={senha} onChange={(e) => setSenha(e.target.value)} type="password"
          onKeyDown={(e) => { if (e.key === "Enter") entrar(); }} /></label>
        {erro ? <div className="aviso erro" style={{ marginTop: 12 }}>{erro}</div> : null}
        <button style={{ marginTop: 16, width: "100%" }} onClick={entrar} disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
      </div>
    </div>
  );
}
