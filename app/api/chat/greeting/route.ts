import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMemory } from "@/lib/memory"

// Devuelve saludo según hora local del país del tenant y botones rápidos adaptativos
// basados en el historial de memoria aprendida.
export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const userName = session.user.name ?? session.user.email?.split("@")[0] ?? "Juan"

  // Obtener país configurado (default España)
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { config: true },
  })
  const config = (tenant?.config ?? {}) as Record<string, unknown>
  const country = (config.country as string) || "ES"

  // Calcular hora local según país
  const countryTimezones: Record<string, string> = {
    AR: "America/Argentina/Buenos_Aires",
    UY: "America/Montevideo",
    PY: "America/Asuncion",
    BO: "America/La_Paz",
    CL: "America/Santiago",
    PE: "America/Lima",
    CO: "America/Bogota",
    EC: "America/Guayaquil",
    VE: "America/Caracas",
    MX: "America/Mexico_City",
    GT: "America/Guatemala",
    HN: "America/Tegucigalpa",
    SV: "America/El_Salvador",
    NI: "America/Managua",
    CR: "America/Costa_Rica",
    PA: "America/Panama",
    CU: "America/Havana",
    DO: "America/Santo_Domingo",
    PR: "America/Puerto_Rico",
    ES: "Europe/Madrid",
    OTHER: "Europe/Madrid",
  }

  const tz = countryTimezones[country] ?? "Europe/Madrid"
  const now = new Date()
  const hour = parseInt(
    now.toLocaleString("es", { timeZone: tz, hour: "numeric", hour12: false }),
    10
  )

  let greeting: string
  if (hour >= 6 && hour < 14) greeting = "Buenos días"
  else if (hour >= 14 && hour < 21) greeting = "Buenas tardes"
  else greeting = "Buenas noches"

  // Botones rápidos: base siempre disponible
  const baseActions = [
    { label: "Emails pendientes", prompt: "¿Qué emails tengo sin responder?" },
    { label: "WhatsApp de hoy", prompt: "Resúmeme los mensajes de WhatsApp de hoy" },
    { label: "Temas urgentes", prompt: "¿Hay algún tema urgente pendiente?" },
    { label: "Crear documento", prompt: "Crea un documento en blanco para que pueda escribir" },
  ]

  // Ajustar botones según memoria aprendida
  const memory = await getMemory(tenantId)
  const adaptiveActions = [...baseActions]

  if (memory.facts.length > 0) {
    // Si hay hechos de tipo "contacto", ofrecer revisar esos contactos
    const contactFacts = memory.facts.filter((f) => f.category === "contacto")
    if (contactFacts.length > 0) {
      const contactName = extractFirstName(contactFacts[contactFacts.length - 1].fact)
      if (contactName) {
        adaptiveActions[1] = {
          label: `Mensajes de ${contactName}`,
          prompt: `¿Qué mensajes tengo de ${contactName}?`,
        }
      }
    }

    // Si hay temas de negocio recurrentes, ofrecer ese contexto
    const negocioFacts = memory.facts.filter((f) => f.category === "negocio")
    if (negocioFacts.length > 0) {
      adaptiveActions[2] = {
        label: "Estado del negocio",
        prompt: "Dame un resumen del estado actual del negocio basándote en lo que sabés de mí",
      }
    }

    // Si hay objetivos, recordarlos
    const objetivoFacts = memory.facts.filter((f) => f.category === "objetivo")
    if (objetivoFacts.length > 0) {
      adaptiveActions[3] = {
        label: "Mis objetivos",
        prompt: "Recuérdame mis objetivos actuales y dime si hay algo que debería estar haciendo",
      }
    }
  }

  return NextResponse.json({
    greeting: `${greeting}, ${firstName(userName)}`,
    actions: adaptiveActions.slice(0, 4),
    memoryFacts: memory.facts.length,
  })
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name
}

function extractFirstName(fact: string): string | null {
  // Intenta extraer un nombre propio del hecho (primera palabra capitalizada)
  const match = fact.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b/)
  return match ? match[1] : null
}
