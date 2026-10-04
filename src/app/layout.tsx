import "./outtax.css";
import "./globals.css";
import { listarSocios } from "@/lib/socios";
import type { Metadata } from "next";
import Nav from "@/components/Nav";
import RegistrarApp from "@/components/RegistrarApp";
import { sbServer } from "@/lib/auth";

export const metadata: Metadata = { title: "Mesa do Sócio · Outtax" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#152c6b" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data } = await sbServer().auth.getUser();
  const u = data.user;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("tema");if(t!=="claro"&&t!=="escuro")t=matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro";document.documentElement.dataset.theme=t}catch(e){}` }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icone-192.png" />
        <link rel="apple-touch-icon" href="/icone-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={u ? "com-lateral" : ""}>
        {u && <Nav email={u.email} nome={u.email ? (await listarSocios()).find(s => s.email === u.email!.toLowerCase())?.primeiro : undefined} />}
        {u && <RegistrarApp />}
        <main>{children}</main>
      </body>
    </html>
  );
}
