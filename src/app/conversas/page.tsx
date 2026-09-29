import Topo from "@/components/Topo";
import ModoSelect from "@/components/ModoSelect";
import { db } from "@/lib/db";
import { dataHora } from "@/lib/fmt";

export const dynamic = "force-dynamic";

const ABAS: [string, string][] = [
  ["todas", "Todas"], ["auto", "🤖 Automático"], ["grupo", "👥 Grupos do escritório"],
  ["pessoal", "🏠 Pessoal"], ["ignorada", "🚫 Ignoradas"],
];

export default async function Conversas({ searchParams }: { searchParams: { q?: string; ver?: string } }) {
  const q = (searchParams.q || "").trim();
  const ver = ABAS.some(([v]) => v === searchParams.ver) ? searchParams.ver! : "todas";
  let consulta = db().from("conversas").select("*")
    .order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(300);
  consulta = ver === "todas" ? consulta.neq("modo", "ignorada") : consulta.eq("modo", ver);
  if (q) consulta = consulta.ilike("nome", `%${q}%`);
  const { data } = await consulta;

  return (
    <>
      <Topo />
      <div className="conteudo">
        <h1>Conversas</h1>
        <div className="sub">Escolha o modo de cada conversa. Família e amigos → 🏠 Pessoal. Algo realmente privado → 🚫 Ignorar.</div>
        <div className="abas">
          {ABAS.map(([v, r]) => (
            <a key={v} href={v === "todas" ? "/conversas" : `/conversas?ver=${v}`} className={ver === v ? "ativa" : ""}>{r}</a>
          ))}
        </div>
        <form style={{ margin: "12px 0", maxWidth: 400 }}>
          {ver !== "todas" ? <input type="hidden" name="ver" value={ver} /> : null}
          <input name="q" defaultValue={q} placeholder="Buscar por nome…" />
        </form>
        <table>
          <thead><tr><th>Contato / grupo</th><th>Número</th><th>Última mensagem</th><th>Quando</th><th>Modo</th></tr></thead>
          <tbody>
            {(data || []).map((c) => (
              <tr key={c.id}>
                <td>
                  <a href={`/conversas/${c.id}`}>{c.is_grupo ? "👥 " : ""}{c.nome}</a>
                  {c.precisa_resposta ? " ⏳" : ""}{c.sem_retorno ? " 🔴" : ""}
                </td>
                <td><span className="selo inst">{c.instancia}</span></td>
                <td style={{ maxWidth: 340 }}>{c.ultima_msg_texto}</td>
                <td>{dataHora(c.ultima_msg_em)}</td>
                <td><ModoSelect id={c.id} modo={c.modo} /></td>
              </tr>
            ))}
            {!data?.length ? <tr><td colSpan={5} className="vazio">Nenhuma conversa aqui.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
