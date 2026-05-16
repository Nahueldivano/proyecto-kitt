"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

function StarIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "#f5b50a" : "none"}
      stroke={filled ? "#f5b50a" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatRow {
  chatJid: string
  chatName: string | null
  contactName: string | null
  messageCount: number
  lastMessageAt: string
  lastMessageBody: string
}

interface MessageRow {
  id: string
  externalId: string | null
  chatJid: string
  chatName: string | null
  contactName: string | null
  fromMe: boolean
  body: string
  messageType: string
  timestamp: string
  metadata: Record<string, unknown>
}

interface Stats {
  total: number
  audios: number
  pendingAudios: number
}

interface EmailSummary {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
  threadId: string
}

interface EmailFull extends EmailSummary {
  body: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

function chatDisplayName(c: { chatName: string | null; contactName: string | null; chatJid: string }): string {
  if (c.chatJid.endsWith("@g.us") && c.chatName?.trim()) return c.chatName
  if (c.contactName?.trim()) return c.contactName
  if (c.chatJid.endsWith("@g.us")) return `Grupo ${c.chatJid.replace(/@g\.us$/, "").slice(-6)}`
  return `+${c.chatJid.replace(/@.+$/, "")}`
}

function tabCls(active: boolean) {
  return cn(
    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
    active
      ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
      : "border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]"
  )
}

// ── WhatsApp Panel ─────────────────────────────────────────────────────────

function WhatsAppPanel() {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ChatRow | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<MessageRow[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [batchTranscribing, setBatchTranscribing] = useState(false)
  const [syncDays, setSyncDays] = useState<number>(7)
  const [syncUseCustomRange, setSyncUseCustomRange] = useState(false)
  const [syncSince, setSyncSince] = useState("")
  const [syncUntil, setSyncUntil] = useState("")
  const [whitelistCount, setWhitelistCount] = useState<number>(0)
  const [savingContact, setSavingContact] = useState<string | null>(null) // chatJid en proceso
  const [editingContactName, setEditingContactName] = useState<Record<string, string>>({}) // chatJid → nombre temporal
  // Mapa chatJid → { id de Contact, isFavorite }. Permite togglear estrella sin re-fetch.
  const [savedContacts, setSavedContacts] = useState<Map<string, { id: string; isFavorite: boolean }>>(new Map())

  const loadChats = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/whatsapp/db")
      const d = await r.json()
      setChats(d.chats ?? [])
      setStats(d.stats ?? null)
    } catch { setChats([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadChats()
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const wl = d.config?.waContactWhitelist
        setWhitelistCount(Array.isArray(wl) ? wl.length : 0)
      })
      .catch(() => {})
    // Cargar contactos ya guardados para mostrar estado en la UI (mapa por chatJid con id y favorito)
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => {
        const m = new Map<string, { id: string; isFavorite: boolean }>()
        for (const c of (d.contacts ?? []) as { id: string; chatJid: string; isFavorite?: boolean }[]) {
          m.set(c.chatJid, { id: c.id, isFavorite: !!c.isFavorite })
        }
        setSavedContacts(m)
      })
      .catch(() => {})
  }, [loadChats])

  const isSaved = useCallback((chatJid: string) => savedContacts.has(chatJid), [savedContacts])

  const onToggleFavorite = useCallback(async (chatJid: string) => {
    const entry = savedContacts.get(chatJid)
    if (!entry) return
    const next = !entry.isFavorite
    setSavedContacts(prev => {
      const m = new Map(prev)
      m.set(chatJid, { ...entry, isFavorite: next })
      return m
    })
    try {
      await fetch(`/api/contacts/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      })
    } catch {
      // rollback
      setSavedContacts(prev => {
        const m = new Map(prev)
        m.set(chatJid, entry)
        return m
      })
    }
  }, [savedContacts])

  const loadMessages = useCallback(async (chat: ChatRow) => {
    setMessagesLoading(true)
    try {
      const r = await fetch(`/api/whatsapp/db?chatJid=${encodeURIComponent(chat.chatJid)}`)
      const d = await r.json()
      setMessages(d.messages ?? [])
    } catch { setMessages([]) }
    finally { setMessagesLoading(false) }
  }, [])

  useEffect(() => {
    if (selected) { loadMessages(selected); setSearchResults(null) }
  }, [selected, loadMessages])

  const onSaveContact = useCallback(async (chat: ChatRow) => {
    if (savedContacts.has(chat.chatJid)) return // ya guardado

    const name = editingContactName[chat.chatJid] ?? chatDisplayName(chat)
    setSavingContact(chat.chatJid)
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatJid: chat.chatJid,
          name,
          isGroup: chat.chatJid.endsWith("@g.us"),
        }),
      })
      if (r.ok) {
        const d = await r.json()
        const created = d.contact as { id: string; isFavorite?: boolean } | undefined
        if (created) {
          setSavedContacts(prev => {
            const m = new Map(prev)
            m.set(chat.chatJid, { id: created.id, isFavorite: !!created.isFavorite })
            return m
          })
        }
      }
    } catch { /* silencioso */ }
    finally { setSavingContact(null) }
  }, [savedContacts, editingContactName])

  const onSearch = useCallback(async () => {
    const q = search.trim()
    if (!q) { setSearchResults(null); return }
    setSearching(true)
    try {
      const r = await fetch(`/api/whatsapp/db?q=${encodeURIComponent(q)}`)
      const d = await r.json()
      setSearchResults(d.messages ?? [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }, [search])

  const onSync = useCallback(async () => {
    setSyncing(true); setSyncStatus(null)
    try {
      const body: Record<string, unknown> = {}
      if (syncUseCustomRange) {
        if (syncSince) body.since = new Date(syncSince).toISOString()
        if (syncUntil) body.until = new Date(syncUntil + "T23:59:59").toISOString()
      } else {
        body.historyDays = syncDays
      }
      const r = await fetch("/api/whatsapp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.ok) {
        setSyncStatus(`Sincronizado: ${d.messagesSaved ?? 0} mensajes nuevos`)
        await loadChats()
        if (selected) await loadMessages(selected)
      } else {
        setSyncStatus(`Error: ${d.error ?? "desconocido"}`)
      }
    } catch (err) {
      setSyncStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setSyncing(false) }
  }, [loadChats, loadMessages, selected, syncDays, syncUseCustomRange, syncSince, syncUntil])

  const onTranscribe = useCallback(async (msg: MessageRow) => {
    setTranscribingId(msg.id)
    try {
      const r = await fetch("/api/whatsapp/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id }),
      })
      const d = await r.json()
      if (d.transcribed > 0 && selected) await loadMessages(selected)
      else if (d.errors?.length) alert(`No se pudo transcribir: ${d.errors[0]}`)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setTranscribingId(null) }
  }, [loadMessages, selected])

  const onBatchTranscribe = useCallback(async () => {
    setBatchTranscribing(true)
    try {
      const r = await fetch("/api/whatsapp/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, max: 30 }),
      })
      const d = await r.json()
      setSyncStatus(`Audios: ${d.transcribed ?? 0} transcritos / ${d.failed ?? 0} fallidos`)
      await loadChats()
      if (selected) await loadMessages(selected)
    } catch (err) {
      setSyncStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setBatchTranscribing(false) }
  }, [loadChats, loadMessages, selected])

  const filteredChats = useMemo(() => {
    if (!search.trim() || searchResults) return chats
    const q = search.trim().toLowerCase()
    return chats.filter(
      (c) => chatDisplayName(c).toLowerCase().includes(q) || c.lastMessageBody.toLowerCase().includes(q)
    )
  }, [chats, search, searchResults])

  return (
    <div className="h-full flex overflow-hidden">
      {/* Lista de chats */}
      <div className={`w-full md:w-96 border-r border-[hsl(var(--border))] flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="px-4 py-4 border-b border-[hsl(var(--border))] space-y-3">
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--text))]">WhatsApp</p>
            <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">
              {stats
                ? `${stats.total} mensajes · ${stats.audios} audios (${stats.pendingAudios} sin transcribir)`
                : "Mensajes sincronizados que KITT puede leer como contexto"}
            </p>
          </div>

          <input
            type="text"
            placeholder="Buscar en chats o mensajes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch() }}
            className="w-full px-3 py-2 text-sm rounded-md bg-[hsl(var(--surface))] border border-[hsl(var(--border))] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
          />

          {/* Selector de rango para sync */}
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[{ d: 7, l: "7d" }, { d: 14, l: "14d" }, { d: 30, l: "30d" }].map(({ d, l }) => (
                <button
                  key={d}
                  onClick={() => { setSyncDays(d); setSyncUseCustomRange(false) }}
                  className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                    !syncUseCustomRange && syncDays === d
                      ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                      : "border-[hsl(var(--border-2))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent))]"
                  }`}
                >{l}</button>
              ))}
              <button
                onClick={() => setSyncUseCustomRange(true)}
                className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                  syncUseCustomRange
                    ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                    : "border-[hsl(var(--border-2))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent))]"
                }`}
              >Rango</button>
            </div>
            {syncUseCustomRange && (
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={syncSince}
                  onChange={(e) => setSyncSince(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs rounded border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                />
                <span className="text-[10px] text-[hsl(var(--text-3))] self-center">→</span>
                <input
                  type="date"
                  value={syncUntil}
                  onChange={(e) => setSyncUntil(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs rounded border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                />
              </div>
            )}
          </div>

          {whitelistCount > 0 && (
            <p className="text-[10px] text-[hsl(var(--text-3))]">
              Filtro activo: {whitelistCount} chat{whitelistCount !== 1 ? "s" : ""} seleccionado{whitelistCount !== 1 ? "s" : ""} en configuración
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onSync} disabled={syncing}
              className="flex-1 px-3 py-1.5 text-xs rounded-md bg-[hsl(var(--accent))] text-white hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "Sincronizando…" : "Re-sincronizar"}
            </button>
            {stats && stats.pendingAudios > 0 && (
              <button
                onClick={onBatchTranscribe} disabled={batchTranscribing}
                className="flex-1 px-3 py-1.5 text-xs rounded-md bg-[hsl(var(--surface))] border border-[hsl(var(--border))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-50"
              >
                {batchTranscribing ? "Transcribiendo…" : `Transcribir ${stats.pendingAudios} audios`}
              </button>
            )}
          </div>
          {syncStatus && <p className="text-xs text-[hsl(var(--text-2))]">{syncStatus}</p>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-[hsl(var(--text-3))]">Cargando…</div>
          ) : searchResults ? (
            <div>
              <div className="px-4 py-2 text-xs text-[hsl(var(--text-3))] border-b border-[hsl(var(--border))]">
                {searching ? "Buscando…" : `${searchResults.length} resultados`}
              </div>
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(chats.find((c) => c.chatJid === m.chatJid) ?? null)}
                  className="w-full text-left px-4 py-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface))]"
                >
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-sm font-medium text-[hsl(var(--text))] truncate">
                      {m.chatName ?? m.contactName ?? m.chatJid.replace(/@.+$/, "")}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--text-3))]">{fmtDate(m.timestamp)}</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--text-2))] mt-1 line-clamp-2">{m.body}</p>
                </button>
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-[hsl(var(--text-3))]">No hay chats sincronizados.</p>
              <p className="text-xs text-[hsl(var(--text-3))]">Tocá "Re-sincronizar" para traer mensajes desde WhatsApp.</p>
            </div>
          ) : (
            filteredChats.map((c) => {
              const saved = savedContacts.get(c.chatJid)
              return (
                <div
                  key={c.chatJid}
                  className={`flex items-stretch border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface))] ${selected?.chatJid === c.chatJid ? "bg-[hsl(var(--surface))]" : ""}`}
                >
                  {saved && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(c.chatJid) }}
                      className="pl-3 pr-1 flex items-center text-[hsl(var(--text-3))] hover:text-[#f5b50a]"
                      title={saved.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
                      aria-label="Favorito"
                    >
                      <StarIcon filled={saved.isFavorite} size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(c)}
                    className={`flex-1 text-left px-4 py-3 ${saved ? "pl-2" : ""}`}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-sm font-medium text-[hsl(var(--text))] truncate">
                        {chatDisplayName(c)}
                      </span>
                      <span className="text-[10px] text-[hsl(var(--text-3))] shrink-0">{fmtDate(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-2 mt-1">
                      <p className="text-xs text-[hsl(var(--text-2))] truncate flex-1">{c.lastMessageBody}</p>
                      <span className="text-[10px] text-[hsl(var(--text-3))] bg-[hsl(var(--surface))] px-1.5 py-0.5 rounded shrink-0">{c.messageCount}</span>
                    </div>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Detalle de mensajes */}
      <div className={`flex-1 flex flex-col ${selected ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <>
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-3">
              <button onClick={() => setSelected(null)} className="md:hidden text-sm text-[hsl(var(--text-2))]">← Volver</button>
              <div className="flex-1 min-w-0">
                {/* Nombre editable del contacto */}
                {isSaved(selected.chatJid) ? (
                  <h2 className="text-sm font-semibold text-[hsl(var(--text))] truncate flex items-center gap-1.5">
                    {chatDisplayName(selected)}
                    <span className="text-[10px] text-green-500 font-normal">● guardado</span>
                  </h2>
                ) : (
                  <input
                    value={editingContactName[selected.chatJid] ?? chatDisplayName(selected)}
                    onChange={(e) => setEditingContactName(prev => ({ ...prev, [selected.chatJid]: e.target.value }))}
                    className="text-sm font-semibold text-[hsl(var(--text))] bg-transparent border-b border-transparent focus:border-[hsl(var(--accent))] outline-none w-full max-w-[180px] truncate"
                    placeholder="Nombre del contacto"
                  />
                )}
                <p className="text-[10px] text-[hsl(var(--text-3))] truncate">{selected.chatJid} · {selected.messageCount} mensajes</p>
              </div>
              {/* Botón favorito (solo si ya está guardado como contacto) */}
              {isSaved(selected.chatJid) && (
                <button
                  onClick={() => onToggleFavorite(selected.chatJid)}
                  className="p-1.5 rounded-lg hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--text-3))] shrink-0"
                  title={savedContacts.get(selected.chatJid)?.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
                  aria-label="Favorito"
                >
                  <StarIcon filled={!!savedContacts.get(selected.chatJid)?.isFavorite} size={20} />
                </button>
              )}
              {/* Botón guardar como contacto */}
              {!isSaved(selected.chatJid) && (
                <button
                  onClick={() => onSaveContact(selected)}
                  disabled={savingContact === selected.chatJid}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[hsl(var(--accent))] text-white hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
                >
                  {savingContact === selected.chatJid ? (
                    "Guardando..."
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      Guardar contacto
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[hsl(var(--bg))]">
              {messagesLoading ? (
                <div className="text-center text-sm text-[hsl(var(--text-3))] py-8">Cargando mensajes…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-[hsl(var(--text-3))] py-8">Sin mensajes guardados.</div>
              ) : (
                messages.map((m) => {
                  const isPendingAudio = m.messageType === "audio" && m.body === "[audio]"
                  return (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${m.fromMe ? "bg-[hsl(var(--accent))] text-white" : "bg-[hsl(var(--surface))] text-[hsl(var(--text))] border border-[hsl(var(--border))]"}`}>
                        {!m.fromMe && m.contactName && (
                          <p className="text-[10px] font-semibold opacity-80 mb-0.5">{m.contactName}</p>
                        )}
                        {m.messageType !== "text" && (
                          <p className="text-[10px] opacity-70 uppercase tracking-wide mb-0.5">{m.messageType}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        {isPendingAudio && (
                          <button
                            onClick={() => onTranscribe(m)}
                            disabled={transcribingId === m.id}
                            className="mt-2 text-[11px] underline opacity-90 hover:opacity-100 disabled:opacity-50"
                          >
                            {transcribingId === m.id ? "Transcribiendo…" : "Transcribir"}
                          </button>
                        )}
                        <p className="text-[10px] opacity-60 mt-1 text-right">{fmtTime(m.timestamp)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[hsl(var(--text-3))]">
            Seleccioná un chat para ver los mensajes
          </div>
        )}
      </div>
    </div>
  )
}

// ── Gmail Panel ─────────────────────────────────────────────────────────────

function GmailPanel({ connected }: { connected: boolean }) {
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<EmailFull | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)

  useEffect(() => {
    if (!connected) return
    setLoading(true)
    fetch("/api/gmail/db?max=30")
      .then((r) => r.json())
      .then((d) => setEmails(d.emails ?? []))
      .catch(() => setEmails([]))
      .finally(() => setLoading(false))
  }, [connected])

  async function loadEmail(id: string) {
    setBodyLoading(true)
    try {
      const r = await fetch(`/api/gmail/db?id=${encodeURIComponent(id)}`)
      const d = await r.json()
      setSelected(d.email ?? null)
    } catch { setSelected(null) }
    finally { setBodyLoading(false) }
  }

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[hsl(var(--text-3))]">
        Conectá Gmail en Configuración → Conexiones
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Lista */}
      <div className={`w-full md:w-96 border-r border-[hsl(var(--border))] flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="px-4 py-4 border-b border-[hsl(var(--border))]">
          <p className="text-sm font-semibold text-[hsl(var(--text))]">Gmail</p>
          <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">Emails no leídos (live)</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-[hsl(var(--text-3))]">Cargando…</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-sm text-[hsl(var(--text-3))]">Sin emails no leídos.</div>
          ) : (
            emails.map((e) => (
              <button
                key={e.id}
                onClick={() => loadEmail(e.id)}
                className={`w-full text-left px-4 py-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface))] ${selected?.id === e.id ? "bg-[hsl(var(--surface))]" : ""}`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs font-semibold text-[hsl(var(--text))] truncate">{e.from.replace(/<.+>/, "").trim()}</span>
                  <span className="text-[10px] text-[hsl(var(--text-3))] shrink-0">{e.date.substring(0, 11)}</span>
                </div>
                <p className="text-sm font-medium text-[hsl(var(--text))] truncate mt-0.5">{e.subject || "(sin asunto)"}</p>
                <p className="text-xs text-[hsl(var(--text-3))] line-clamp-2 mt-0.5">{e.snippet}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detalle */}
      <div className={`flex-1 flex flex-col ${selected ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <>
            <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
              <button onClick={() => setSelected(null)} className="md:hidden text-sm text-[hsl(var(--text-2))] mb-2">← Volver</button>
              <h2 className="text-sm font-semibold text-[hsl(var(--text))]">{selected.subject || "(sin asunto)"}</h2>
              <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">{selected.from}</p>
              <p className="text-xs text-[hsl(var(--text-3))]">{selected.date}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {bodyLoading ? (
                <div className="text-sm text-[hsl(var(--text-3))]">Cargando…</div>
              ) : (
                <pre className="text-sm text-[hsl(var(--text))] whitespace-pre-wrap break-words font-sans leading-relaxed">
                  {selected.body}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[hsl(var(--text-3))]">
            Seleccioná un email para leerlo
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function DatabasePage() {
  const [channel, setChannel] = useState<"whatsapp" | "gmail">("whatsapp")
  const [gmailConnected, setGmailConnected] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setGmailConnected(!!d.gmailEmail))
      .catch(() => {})
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Channel selector */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-[hsl(var(--border))] flex-shrink-0">
        <button className={tabCls(channel === "whatsapp")} onClick={() => setChannel("whatsapp")}>
          WhatsApp
        </button>
        <button className={tabCls(channel === "gmail")} onClick={() => setChannel("gmail")}>
          Gmail
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {channel === "whatsapp" && <WhatsAppPanel />}
        {channel === "gmail" && <GmailPanel connected={gmailConnected} />}
      </div>
    </div>
  )
}
