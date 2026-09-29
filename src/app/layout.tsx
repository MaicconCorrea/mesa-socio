import "./globals.css";
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
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icone-192.png" />
        <link rel="apple-touch-icon" href="/icone-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className={u ? "com-lateral" : ""}>
        {u && <Nav email={u.email} />}
        {u && <RegistrarApp />}
        <main>{children}</main>
      </body>
    </html>
  );
}
