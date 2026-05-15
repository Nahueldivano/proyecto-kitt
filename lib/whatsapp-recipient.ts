import { db } from "@/lib/db"

export interface ResolvedRecipient {
  number: string
  isGroup: boolean
  source: "group" | "contact" | "resolver" | "raw"
}

type ResolverFn = (input: string) => Promise<string | null>

function stripSuffix(s: string): string {
  return s.replace(/@[^@]+$/, "")
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "")
}

// Un JID es "sospechoso" (posible @lid disfrazado) si tiene más de 13 dígitos
// y no empieza con prefijos internacionales conocidos de Argentina/LATAM.
// Los números reales de WhatsApp tienen máximo 13 dígitos (código país + número).
function looksLikeLid(phone: string): boolean {
  return phone.length > 13
}

export async function resolveWhatsAppRecipient(
  tenantId: string,
  rawTo: string,
  resolveViaEvolution: ResolverFn
): Promise<ResolvedRecipient> {
  const input = String(rawTo ?? "").trim()
  if (!input) throw new Error("Destinatario WhatsApp vacío")

  if (input.endsWith("@g.us")) {
    console.log(`[wa-recipient] input=${input} resolved=${input} source=group`)
    return { number: input, isGroup: true, source: "group" }
  }

  const hasLidSuffix = input.endsWith("@lid")
  const stripped = stripSuffix(input)
  const phone = digitsOnly(stripped)

  if (hasLidSuffix || looksLikeLid(phone)) {
    // Buscar en Contact todas las variantes posibles del mismo contacto:
    // - chatJid exacto (ej: 25683921248357@lid)
    // - chatJid con @s.whatsapp.net (ej: 25683921248357@s.whatsapp.net)
    // - phone exacto (ej: 5491157589161)
    // Traemos todos los matches y elegimos el que tenga phone real
    const contacts = await db.contact.findMany({
      where: {
        tenantId,
        OR: [
          { chatJid: input },
          { chatJid: `${phone}@s.whatsapp.net` },
          { chatJid: `${phone}@lid` },
          { phone },
        ],
      },
      select: { phone: true, chatJid: true },
    }).catch(() => [] as Array<{ phone: string | null; chatJid: string }>)

    // Prioridad: phone real ≤13 dígitos > chatJid @s.whatsapp.net con número real
    for (const contact of contacts) {
      const contactPhone = contact.phone ? digitsOnly(contact.phone) : null
      if (contactPhone && !looksLikeLid(contactPhone)) {
        console.log(`[wa-recipient] input=${input} resolved=${contactPhone} source=contact`)
        return { number: contactPhone, isGroup: false, source: "contact" }
      }
    }
    for (const contact of contacts) {
      if (contact.chatJid.endsWith("@s.whatsapp.net")) {
        const jidPhone = digitsOnly(stripSuffix(contact.chatJid))
        if (!looksLikeLid(jidPhone)) {
          console.log(`[wa-recipient] input=${input} resolved=${jidPhone} source=contact-jid`)
          return { number: jidPhone, isGroup: false, source: "contact" }
        }
      }
    }

    // Último recurso: preguntarle a Evolution
    const resolved = await resolveViaEvolution(input).catch(() => null)
    if (resolved) {
      const resolvedPhone = digitsOnly(stripSuffix(resolved))
      if (resolvedPhone && !looksLikeLid(resolvedPhone)) {
        console.log(`[wa-recipient] input=${input} resolved=${resolvedPhone} source=resolver`)
        return { number: resolvedPhone, isGroup: false, source: "resolver" }
      }
    }

    console.warn(`[wa-recipient] input=${input} could not resolve lid — phone=${phone}`)
    // Si llegamos acá con un lid, no tiene sentido mandarlo — va a fallar igual
    throw new Error(`No se pudo resolver el número de WhatsApp para este contacto. Intentá sincronizar WhatsApp primero.`)
  }

  if (!phone) throw new Error(`Destinatario WhatsApp inválido: ${input}`)
  console.log(`[wa-recipient] input=${input} resolved=${phone} source=raw`)
  return { number: phone, isGroup: false, source: "raw" }
}
