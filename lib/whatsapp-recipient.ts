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

function looksLikeLid(phone: string): boolean {
  return phone.length > 13 && !phone.startsWith("549") && !phone.startsWith("54")
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
    const contact = await db.contact.findFirst({
      where: {
        tenantId,
        OR: [{ chatJid: input }, { chatJid: `${phone}@s.whatsapp.net` }, { phone }],
      },
      select: { phone: true, chatJid: true },
    }).catch(() => null)

    const contactPhone = contact?.phone ? digitsOnly(contact.phone) : null
    if (contactPhone && !looksLikeLid(contactPhone)) {
      console.log(`[wa-recipient] input=${input} resolved=${contactPhone} source=contact`)
      return { number: contactPhone, isGroup: false, source: "contact" }
    }

    const resolved = await resolveViaEvolution(input).catch(() => null)
    if (resolved) {
      const resolvedPhone = digitsOnly(stripSuffix(resolved))
      if (resolvedPhone) {
        console.log(`[wa-recipient] input=${input} resolved=${resolvedPhone} source=resolver`)
        return { number: resolvedPhone, isGroup: false, source: "resolver" }
      }
    }

    console.warn(`[wa-recipient] input=${input} could not resolve @lid — falling back to raw phone ${phone}`)
  }

  if (!phone) throw new Error(`Destinatario WhatsApp inválido: ${input}`)
  console.log(`[wa-recipient] input=${input} resolved=${phone} source=raw`)
  return { number: phone, isGroup: false, source: "raw" }
}
