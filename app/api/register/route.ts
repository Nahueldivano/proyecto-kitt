import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      )
    }

    // Verificar que el email no exista
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email" },
        { status: 409 }
      )
    }

    // Crear tenant + usuario
    const passwordHash = await bcrypt.hash(password, 12)

    const tenant = await db.tenant.create({
      data: {
        name: name ?? email,
        config: {
          assistantName: "KITT",
          tone: "professional",
          model: "claude-sonnet-4-5-20251001",
        },
      },
    })

    await db.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        tenantId: tenant.id,
        onboardingDone: false,
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("[register] error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
