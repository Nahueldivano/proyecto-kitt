// scripts/migrate-db.js
// Creates / updates the DB schema using raw SQL (no Prisma CLI needed).
// Runs before Next.js server starts — safe to run multiple times (idempotent).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require("pg")

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  })

  let client
  try {
    client = await pool.connect()
    console.log("[migrate] Conexión a DB exitosa")

    // ── Tenant ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Tenant" (
        "id"        TEXT    NOT NULL,
        "name"      TEXT    NOT NULL,
        "config"    JSONB   NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
      )
    `)

    // ── User ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id"             TEXT    NOT NULL,
        "email"          TEXT    NOT NULL,
        "passwordHash"   TEXT,
        "name"           TEXT,
        "tenantId"       TEXT    NOT NULL,
        "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── WhatsappSession ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "WhatsappSession" (
        "id"           TEXT NOT NULL,
        "tenantId"     TEXT NOT NULL,
        "status"       TEXT NOT NULL DEFAULT 'disconnected',
        "instanceName" TEXT NOT NULL,
        "connectedAt"  TIMESTAMP(3),
        CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappSession_tenantId_key" ON "WhatsappSession"("tenantId")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "WhatsappSession" ADD CONSTRAINT "WhatsappSession_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── GmailConnection ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "GmailConnection" (
        "id"           TEXT NOT NULL,
        "tenantId"     TEXT NOT NULL,
        "email"        TEXT NOT NULL,
        "accessToken"  TEXT NOT NULL,
        "refreshToken" TEXT NOT NULL,
        "connectedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "GmailConnection_tenantId_key" ON "GmailConnection"("tenantId")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Folder ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Folder" (
        "id"        TEXT NOT NULL,
        "tenantId"  TEXT NOT NULL,
        "name"      TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "Folder_tenantId_idx" ON "Folder"("tenantId")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Folder" ADD CONSTRAINT "Folder_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Conversation ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Conversation" (
        "id"        TEXT NOT NULL,
        "tenantId"  TEXT NOT NULL,
        "title"     TEXT,
        "folderId"  TEXT,
        "model"     TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
      )
    `)
    // Add columns that may be missing in older deployments
    await client.query(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "title"     TEXT`)
    await client.query(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "folderId"  TEXT`)
    await client.query(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "model"     TEXT`)
    await client.query(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`)
    await client.query(`UPDATE "Conversation" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL`)

    await client.query(`CREATE INDEX IF NOT EXISTS "Conversation_tenantId_idx" ON "Conversation"("tenantId")`)
    await client.query(`CREATE INDEX IF NOT EXISTS "Conversation_folderId_idx" ON "Conversation"("folderId")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_folderId_fkey"
          FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Message ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Message" (
        "id"             TEXT  NOT NULL,
        "conversationId" TEXT  NOT NULL,
        "role"           TEXT  NOT NULL,
        "content"        TEXT  NOT NULL,
        "type"           TEXT  NOT NULL DEFAULT 'text',
        "metadata"       JSONB NOT NULL DEFAULT '{}',
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Report ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Report" (
        "id"          TEXT NOT NULL,
        "tenantId"    TEXT NOT NULL,
        "type"        TEXT NOT NULL,
        "content"     TEXT NOT NULL,
        "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "Report_tenantId_generatedAt_idx" ON "Report"("tenantId", "generatedAt")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── PendingAction ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "PendingAction" (
        "id"        TEXT  NOT NULL,
        "tenantId"  TEXT  NOT NULL,
        "type"      TEXT  NOT NULL,
        "payload"   JSONB NOT NULL,
        "status"    TEXT  NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "PendingAction_tenantId_status_idx" ON "PendingAction"("tenantId", "status")`)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── AppConfig ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AppConfig" (
        "key"       TEXT NOT NULL,
        "value"     TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
      )
    `)

    console.log("[migrate] Schema DB actualizado correctamente")
  } catch (err) {
    console.error("[migrate] Error durante la migración:", err.message)
    // No bloqueamos el inicio del servidor
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

main()
