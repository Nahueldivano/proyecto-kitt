import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { SessionProvider } from "@/components/providers/SessionProvider"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Hace que el layout se achique cuando aparece el teclado virtual en Android
  interactiveWidget: "resizes-content",
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000"),
  title: "KITT — Asistente Empresarial IA",
  description: "Tu asistente empresarial de inteligencia artificial",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "KITT — Asistente Empresarial IA",
    description: "Tu asistente empresarial de inteligencia artificial",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KITT",
    startupImage: "/icons/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      {/* CSS crítico inline: garantiza que las variables del design system
          estén disponibles aunque el stylesheet externo tarde en cargar */}
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          :root{--background:0 0% 100%;--surface:0 0% 98%;--surface-2:0 0% 95%;--border:0 0% 90%;--border-2:0 0% 82%;--text:0 0% 9%;--text-2:0 0% 32%;--text-3:0 0% 55%;--accent:238 84% 67%;--accent-hover:238 84% 60%;--accent-soft:238 84% 67% / 0.1;--success:142 71% 45%;--warning:38 92% 50%;--destructive:0 84% 60%;--radius:0.5rem}
          .dark{--background:222 14% 8%;--surface:222 14% 11%;--surface-2:222 14% 15%;--border:222 14% 20%;--border-2:222 14% 27%;--text:0 0% 95%;--text-2:0 0% 70%;--text-3:0 0% 48%;--accent:238 84% 67%}
          body{background-color:hsl(var(--background));color:hsl(var(--text));font-family:ui-sans-serif,system-ui,sans-serif;margin:0}
        `}} />
      </head>
      <body className={inter.variable}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </SessionProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        `}} />
      </body>
    </html>
  )
}
