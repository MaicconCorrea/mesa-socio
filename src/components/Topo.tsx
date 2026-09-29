import { sair } from "@/app/actions";

export default function Topo() {
  return (
    <div className="topo">
      <div className="marca">OUTTAX <span>·</span> Mesa do Sócio</div>
      <a href="/">Hoje</a>
      <a href="/conversas">Conversas</a>
      <a href="/config">Configuração</a>
      <form action={sair} className="dir">
        <button type="submit">Sair</button>
      </form>
    </div>
  );
}
