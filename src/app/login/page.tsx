"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro(""); setCarregando(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro("E-mail ou senha incorretos."); return; }
    window.location.href = "/";
  }

  return (
    <div className="login">
      <h1>OUTTAX · Mesa do Sócio</h1>
      <label>E-mail</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      <label>Senha</label>
      <input value={senha} onChange={(e) => setSenha(e.target.value)} type="password"
        onKeyDown={(e) => { if (e.key === "Enter") entrar(); }} />
      {erro ? <div className="aviso">{erro}</div> : null}
      <div style={{ marginTop: 16 }}>
        <button className="primario" onClick={entrar} disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
      </div>
    </div>
  );
}
