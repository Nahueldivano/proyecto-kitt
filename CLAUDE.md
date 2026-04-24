# KITT — Contexto del Proyecto para Claude

## ¿Qué es KITT?
KITT es un asistente AI personal para dueños de negocios. Es una app web construida con Next.js 14 (App Router), Prisma, PostgreSQL, NextAuth v5 y la API de Anthropic (Claude). Permite chatear con un AI, conectar WhatsApp y Gmail, y gestionar el contexto del negocio del usuario.

## Stack técnico
- **Framework**: Next.js 14 con App Router (TypeScript)
- **Auth**: NextAuth v5 (Google OAuth + credenciales)
- **DB**: PostgreSQL vía Prisma ORM
- **AI**: Anthropic Claude API (`lib/claude.ts`)
- **WhatsApp**: Evolution API (`lib/evolution.ts`)
- **Email**: Gmail OAuth (`lib/gmail.ts`)
- **Cache**: Redis (`lib/redis.ts`)
- **Styling**: Tailwind CSS con variables CSS custom (ver `app/globals.css`)

## Estructura de carpetas clave
```
app/
  (app)/          → Rutas protegidas del usuario autenticado
    chat/         → Vista principal del chat
    history/      → Historial de conversaciones
    reports/      → Reportes
    settings/     → Configuración (perfil, asistente, integraciones, API key, cuenta)
    onboarding/   → Flujo de onboarding inicial
  (admin)/        → Panel de administración (solo KITT_ADMIN_EMAIL)
  (auth)/         → Login / registro
  api/            → Endpoints del backend
    chat/         → Streaming de chat con Claude
    settings/     → GET/POST config del usuario
    whatsapp/     → status, qr, reconnect
    email/        → connect/disconnect/callback Gmail
    onboarding/   → reset
    conversations/ → historial
    reports/      → generación de reportes

lib/
  claude.ts       → Lógica principal del AI (tools, system prompt, streaming)
  config.ts       → AppConfig: lee config de DB o env vars
  db.ts           → Cliente Prisma
  evolution.ts    → Cliente Evolution API (WhatsApp)
  gmail.ts        → Cliente Gmail OAuth
  memory.ts       → Memoria persistente del asistente
  models.ts       → Lista de modelos disponibles
  redis.ts        → Cliente Redis
  store.ts        → Store de conversaciones

components/
  chat/           → Componentes del chat (mensajes, input, etc)
  layout/         → Sidebar, header, nav
  ui/             → Componentes base (button, input, badge, card, etc)
```

## Reglas de desarrollo — SIEMPRE seguir estas

### Antes de modificar cualquier cosa:
1. **Leer el archivo completo** antes de editar. Nunca asumir la estructura.
2. **Verificar que el endpoint API existe** antes de hacer un fetch desde el frontend.
3. **Correr `npx tsc --noEmit`** después de cada cambio TypeScript para verificar errores.
4. **No crear archivos duplicados** — siempre buscar si ya existe algo similar.

### Al arreglar bugs funcionales:
1. Primero identificar si el problema es **frontend** (UI no hace el fetch) o **backend** (API no responde bien).
2. Usar `console.log` temporales para debuggear, removerlos al terminar.
3. Si un botón no hace nada: verificar que tiene `onClick`, que la función existe, y que el API endpoint existe.
4. Si un formulario no guarda: verificar que `saveConfig` hace POST al endpoint correcto y que el endpoint guarda en DB (no solo en memoria).

### Flujo de settings:
- El frontend usa `/api/settings` GET para cargar y POST para guardar.
- La config del usuario está en el modelo `TenantConfig` en la DB.
- El archivo `lib/config.ts` centraliza la lectura de configuración.

### Flujo de autenticación:
- NextAuth v5 con Google OAuth.
- `auth.ts` en la raíz es el handler principal.
- `middleware.ts` protege las rutas bajo `(app)/` y `(admin)/`.
- La sesión incluye: `user.id`, `user.email`, `onboardingDone`.

### Variables de entorno necesarias (ver `.env.example`):
- `DATABASE_URL` — PostgreSQL
- `AUTH_SECRET` — NextAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth
- `ANTHROPIC_API_KEY` — Claude AI
- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — WhatsApp
- `OPENAI_API_KEY` — Whisper (transcripción de audios)
- `KITT_INTERNAL_KEY` — Autenticación interna
- `KITT_ADMIN_EMAIL` — Email del admin

## Estado actual del proyecto
- La UI está construida visualmente pero algunas funciones pueden no estar 100% conectadas al backend.
- **Prioridad de trabajo**: funcionalidad primero, estética segundo.
- **Al encontrar un botón roto**: verificar la cadena completa: onClick → fetch → API route → DB.

## Cómo correr el proyecto
```bash
npm run dev          # Dev server en localhost:3000
npx prisma studio    # GUI de la DB
npx prisma db push   # Sincronizar schema con DB
npx tsc --noEmit     # Verificar TypeScript sin compilar
```

## Comandos útiles para debugging
```bash
# Ver logs en tiempo real del servidor Next.js
npm run dev

# Verificar tipos TypeScript
npx tsc --noEmit

# Ver el schema de la DB
npx prisma studio
```

## Lo que NO hacer
- ❌ No instalar librerías nuevas sin preguntar primero
- ❌ No modificar el schema de Prisma sin correr `npx prisma db push` después
- ❌ No hardcodear valores que deben venir de variables de entorno
- ❌ No crear componentes UI nuevos si ya existe uno en `components/ui/`
- ❌ No ignorar errores de TypeScript — siempre resolverlos
