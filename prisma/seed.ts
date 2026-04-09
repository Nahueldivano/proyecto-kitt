import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding database...")

  // ---- Tenant demo: David ----
  const davidTenant = await db.tenant.upsert({
    where: { id: "tenant-david" },
    update: {},
    create: {
      id: "tenant-david",
      name: "Empresa de David",
      config: {
        assistantName: "KITT",
        tone: "professional",
        model: "claude-sonnet-4-5-20251001",
        reportSchedule: {
          morning: "08:00",
          midday: "13:00",
          evening: "19:00",
        },
      },
    },
  })

  const davidHash = await bcrypt.hash("david123", 12)
  await db.user.upsert({
    where: { email: "david@empresa.com" },
    update: {},
    create: {
      email: "david@empresa.com",
      passwordHash: davidHash,
      name: "David",
      tenantId: davidTenant.id,
      onboardingDone: false,
    },
  })

  // ---- Tenant admin: Nahuel (Smart Growth) ----
  const adminTenant = await db.tenant.upsert({
    where: { id: "tenant-admin" },
    update: {},
    create: {
      id: "tenant-admin",
      name: "Smart Growth (Admin)",
      config: {},
    },
  })

  const adminHash = await bcrypt.hash("admin", 12)
  await db.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: {
      email: "admin@admin.com",
      passwordHash: adminHash,
      name: "Admin",
      tenantId: adminTenant.id,
      onboardingDone: true,
    },
  })

  console.log("✅ Seed completado")
  console.log("   david@empresa.com / david123 → cliente demo")
  console.log("   admin@admin.com / admin → acceso a /admin")
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
    await pool.end()
  })
