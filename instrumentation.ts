/**
 * Next.js instrumentation — corre una vez al arrancar el servidor.
 * Aplica las columnas/tablas nuevas del schema de forma idempotente
 * usando SQL directo, sin necesidad del Prisma CLI en producción.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { db } = await import("@/lib/db")

  try {
    // 1. Crear tabla Folder si no existe
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Folder" (
        "id"        TEXT        NOT NULL,
        "tenantId"  TEXT        NOT NULL,
        "name"      TEXT        NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
      )
    `)

    // FK Folder → Tenant
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Folder"
          ADD CONSTRAINT "Folder_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)

    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Folder_tenantId_idx" ON "Folder"("tenantId")
    `)

    // 2. Agregar columnas nuevas a Conversation
    await db.$executeRawUnsafe(`
      ALTER TABLE "Conversation"
        ADD COLUMN IF NOT EXISTS "title"     TEXT,
        ADD COLUMN IF NOT EXISTS "folderId"  TEXT,
        ADD COLUMN IF NOT EXISTS "model"     TEXT,
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT NOW()
    `)

    // Rellenar updatedAt en filas existentes
    await db.$executeRawUnsafe(`
      UPDATE "Conversation" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL
    `)

    // FK Conversation → Folder
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Conversation"
          ADD CONSTRAINT "Conversation_folderId_fkey"
          FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)

    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Conversation_folderId_idx" ON "Conversation"("folderId")
    `)

    console.log("[instrumentation] DB schema up to date")
  } catch (err) {
    console.error("[instrumentation] schema migration error:", err)
  }
}
