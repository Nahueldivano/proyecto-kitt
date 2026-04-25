import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { SessionProvider } from "@/components/providers/SessionProvider"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "KITT — Asistente Empresarial IA",
  description: "Tu asistente empresarial de inteligencia artificial",
  icons: {
    icon: "/kitt-logo.png",
    apple: "/kitt-logo.png",
  },
  openGraph: {
    title: "KITT — Asistente Empresarial IA",
    description: "Tu asistente empresarial de inteligencia artificial",
    images: [{ url: "/kitt-logo.png", width: 1904, height: 1536 }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <body>
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
      </body>
    </html>
  )
}
