// Login com a conta Google da Outtax (sem senha, sem chave). Usado pelo popup e pela janela de gravação.
const MESA = "https://mesa-socio.vercel.app";

async function pegarToken(interativo) {
  const { tk, tkExp, email } = await chrome.storage.local.get(["tk", "tkExp", "email"]);
  if (tk && tkExp > Date.now() + 120000) return tk;
  const cfg = await fetch(MESA + "/api/ext/config").then((r) => r.json());
  if (!cfg.clientId) throw new Error("A Mesa ainda não tem o login Google configurado (EXT_OAUTH_CLIENT_ID).");
  const q = new URLSearchParams({
    client_id: cfg.clientId, response_type: "token", redirect_uri: chrome.identity.getRedirectURL(),
    scope: "openid email profile", hd: "outtax.com.br", ...(email ? { login_hint: email } : {}),
    ...(interativo ? { prompt: email ? "consent" : "select_account" } : { prompt: "none" }),
  });
  const volta = await chrome.identity.launchWebAuthFlow({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + q, interactive: !!interativo });
  const p = new URLSearchParams(new URL(volta).hash.slice(1));
  const token = p.get("access_token");
  if (!token) throw new Error(p.get("error") || "Login não concluído.");
  await chrome.storage.local.set({ tk: token, tkExp: Date.now() + Number(p.get("expires_in") || 3600) * 1000 });
  return token;
}

async function mesa(caminho, opts = {}, interativo = false) {
  let token;
  try { token = await pegarToken(false); } catch { token = await pegarToken(interativo); }
  const r = await fetch(MESA + caminho, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { await chrome.storage.local.remove(["tk", "tkExp"]); }
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j;
}
