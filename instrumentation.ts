/**
 * Next.js instrumentation — corre una vez al arrancar el servidor.
 * Crea/actualiza el schema completo de forma idempotente usando SQL crudo
 * vía Prisma ($executeRawUnsafe), sin necesidad del Prisma CLI ni del
 * paquete `pg` en runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { db } = await import("@/lib/db")

  const exec = (sql: string) => db.$executeRawUnsafe(sql)

  try {
    // ── Tenant ────────────────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "Tenant" (
        "id"        TEXT NOT NULL,
        "name"      TEXT NOT NULL,
        "config"    JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
      )
    `)

    // ── User ─────────────────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id"             TEXT NOT NULL,
        "email"          TEXT NOT NULL,
        "passwordHash"   TEXT,
        "name"           TEXT,
        "tenantId"       TEXT NOT NULL,
        "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      )
    `)
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── WhatsappSession ───────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "WhatsappSession" (
        "id"           TEXT NOT NULL,
        "tenantId"     TEXT NOT NULL,
        "status"       TEXT NOT NULL DEFAULT 'disconnected',
        "instanceName" TEXT NOT NULL,
        "connectedAt"  TIMESTAMP(3),
        CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
      )
    `)
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappSession_tenantId_key" ON "WhatsappSession"("tenantId")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "WhatsappSession" ADD CONSTRAINT "WhatsappSession_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── WhatsappMessage ───────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
        "id"           TEXT  NOT NULL,
        "tenantId"     TEXT  NOT NULL,
        "externalId"   TEXT,
        "chatJid"      TEXT  NOT NULL,
        "contactName"  TEXT,
        "fromMe"       BOOLEAN NOT NULL DEFAULT false,
        "body"         TEXT  NOT NULL,
        "messageType"  TEXT  NOT NULL DEFAULT 'text',
        "timestamp"    TIMESTAMP(3) NOT NULL,
        "metadata"     JSONB NOT NULL DEFAULT '{}',
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
      )
    `)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "externalId"  TEXT`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "chatJid"     TEXT NOT NULL DEFAULT ''`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "contactName" TEXT`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "fromMe"      BOOLEAN NOT NULL DEFAULT false`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "body"        TEXT NOT NULL DEFAULT ''`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "messageType" TEXT NOT NULL DEFAULT 'text'`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "timestamp"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`)
    await exec(`ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "metadata"    JSONB NOT NULL DEFAULT '{}'`)
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_externalId_key" ON "WhatsappMessage"("tenantId", "externalId")`)
    await exec(`CREATE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_chatJid_timestamp_idx" ON "WhatsappMessage"("tenantId", "chatJid", "timestamp")`)
    await exec(`CREATE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_timestamp_idx" ON "WhatsappMessage"("tenantId", "timestamp")`)

    // ── GmailConnection ───────────────────────────────────────────────────────
    await exec(`
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
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "GmailConnection_tenantId_key" ON "GmailConnection"("tenantId")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Folder ────────────────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "Folder" (
        "id"        TEXT NOT NULL,
        "tenantId"  TEXT NOT NULL,
        "name"      TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
      )
    `)
    await exec(`CREATE INDEX IF NOT EXISTS "Folder_tenantId_idx" ON "Folder"("tenantId")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "Folder" ADD CONSTRAINT "Folder_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Conversation ──────────────────────────────────────────────────────────
    await exec(`
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
    // Columnas que pueden faltar en deploys viejos
    await exec(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "title"     TEXT`)
    await exec(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "folderId"  TEXT`)
    await exec(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "model"     TEXT`)
    await exec(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`)
    await exec(`UPDATE "Conversation" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL`)
    await exec(`CREATE INDEX IF NOT EXISTS "Conversation_tenantId_idx" ON "Conversation"("tenantId")`)
    await exec(`CREATE INDEX IF NOT EXISTS "Conversation_folderId_idx" ON "Conversation"("folderId")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_folderId_fkey"
          FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Message ───────────────────────────────────────────────────────────────
    await exec(`
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
    await exec(`CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── Report ────────────────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "Report" (
        "id"          TEXT NOT NULL,
        "tenantId"    TEXT NOT NULL,
        "type"        TEXT NOT NULL,
        "content"     TEXT NOT NULL,
        "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
      )
    `)
    await exec(`CREATE INDEX IF NOT EXISTS "Report_tenantId_generatedAt_idx" ON "Report"("tenantId", "generatedAt")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── PendingAction ─────────────────────────────────────────────────────────
    await exec(`
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
    await exec(`CREATE INDEX IF NOT EXISTS "PendingAction_tenantId_status_idx" ON "PendingAction"("tenantId", "status")`)
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_tenantId_fkey"
          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // ── AppConfig ─────────────────────────────────────────────────────────────
    await exec(`
      CREATE TABLE IF NOT EXISTS "AppConfig" (
        "key"       TEXT NOT NULL,
        "value"     TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
      )
    `)

    console.log("[instrumentation] DB schema up to date")
  } catch (err) {
    console.error("[instrumentation] schema migration error:", err)
  }
}
