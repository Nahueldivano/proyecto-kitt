"use client"

import { useEffect, useState, useCallback } from "react"

interface Contact {
  id: string
  chatJid: string
  name: string
  phone: string | null
  isGroup: boolean
  notes: string | null
  tags: string[]
  syncEnabled: boolean
}

function Avatar({ name, isGroup }: { name: string; isGroup: boolean }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
      isGroup
        ? "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
        : "bg-[hsl(var(--surface-2))] text-[hsl(var(--text-2))]"
    }`}>
      {isGroup ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ) : initial}
    </div>
  )
}

function EditModal({ contact, onSave, onClose }: {
  contact: Contact
  onSave: (id: string, data: Partial<Contact>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(contact.name)
  const [notes, setNotes] = useState(contact.notes ?? "")
  const [tagsStr, setTagsStr] = useState((contact.tags ?? []).join(", "))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave(contact.id, {
      name: name.trim(),
      notes: notes.trim() || null,
      tags: tagsStr.split(",").map(t => t.trim()).filter(Boolean),
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full md:max-w-md bg-[hsl(var(--surface))] rounded-t-2xl md:rounded-2xl p-5 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[hsl(var(--text))]">Editar contacto</h3>
          <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="text-xs text-[hsl(var(--text-3))] font-mono break-all">{contact.chatJid}</div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-2))] block mb-1">Nombre *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-2))] block mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))] resize-none"
              placeholder="Cliente VIP, proveedor, equipo..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-2))] block mb-1">Etiquetas (separadas por coma)</label>
            <input
              value={tagsStr}
              onChange={e => setTagsStr(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
              placeholder="cliente, proveedor, equipo"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[hsl(var(--border-2))] text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "people" | "groups">("all")
  const [editing, setEditing] = useState<Contact | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/contacts")
      const d = await r.json()
      setContacts(d.contacts ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    try {
      const r = await fetch("/api/contacts/import", { method: "POST" })
      const d = await r.json()
      setImportResult(`${d.created} contactos importados`)
      await load()
    } catch {
      setImportResult("Error al importar")
    } finally {
      setImporting(false)
    }
  }

  async function handleToggleSync(contact: Contact) {
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncEnabled: !contact.syncEnabled }),
    })
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, syncEnabled: !c.syncEnabled } : c))
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este contacto?")) return
    await fetch(`/api/contacts/${id}`, { method: "DELETE" })
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  async function handleSave(id: string, data: Partial<Contact>) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) || c.chatJid.includes(search)
    const matchFilter = filter === "all" || (filter === "groups" ? c.isGroup : !c.isGroup)
    return matchSearch && matchFilter
  })

  const groups = filtered.filter(c => c.isGroup)
  const people = filtered.filter(c => !c.isGroup)
  const syncCount = contacts.filter(c => c.syncEnabled).length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--text))]">Contactos</h1>
              <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">
                {contacts.length} contactos · {syncCount} con sync activo
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Exportar CSV */}
              <a
                href="/api/contacts/export"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                CSV
              </a>
              {/* Importar desde WA */}
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[hsl(var(--accent))] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {importing ? "Importando..." : "Importar de WA"}
              </button>
            </div>
          </div>

          {importResult && (
            <p className="text-xs text-green-500 mb-2">{importResult}</p>
          )}

          {/* Búsqueda + filtros */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar por nombre, número..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
            />
            {(["all", "people", "groups"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                  filter === f
                    ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                    : "border-[hsl(var(--border-2))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent))]"
                }`}
              >
                {f === "all" ? "Todos" : f === "people" ? "Contactos" : "Grupos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 space-y-6">
          {loading ? (
            <div className="text-center text-sm text-[hsl(var(--text-3))] py-12">Cargando...</div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-[hsl(var(--surface-2))] flex items-center justify-center mx-auto">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[hsl(var(--text-3))]">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[hsl(var(--text))]">Sin contactos aún</p>
                <p className="text-xs text-[hsl(var(--text-3))] mt-1">Importá los contactos desde tus chats de WhatsApp</p>
              </div>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-5 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {importing ? "Importando..." : "Importar de WhatsApp"}
              </button>
            </div>
          ) : (
            <>
              {/* Grupos */}
              {groups.length > 0 && (filter === "all" || filter === "groups") && (
                <section>
                  <h2 className="text-xs font-semibold text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">
                    Grupos ({groups.length})
                  </h2>
                  <div className="space-y-1">
                    {groups.map(c => <ContactRow key={c.id} contact={c} onEdit={setEditing} onToggleSync={handleToggleSync} onDelete={handleDelete} />)}
                  </div>
                </section>
              )}

              {/* Contactos individuales */}
              {people.length > 0 && (filter === "all" || filter === "people") && (
                <section>
                  <h2 className="text-xs font-semibold text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">
                    Contactos ({people.length})
                  </h2>
                  <div className="space-y-1">
                    {people.map(c => <ContactRow key={c.id} contact={c} onEdit={setEditing} onToggleSync={handleToggleSync} onDelete={handleDelete} />)}
                  </div>
                </section>
              )}

              {filtered.length === 0 && (
                <p className="text-center text-sm text-[hsl(var(--text-3))] py-8">Sin resultados para "{search}"</p>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <EditModal
          contact={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ContactRow({ contact, onEdit, onToggleSync, onDelete }: {
  contact: Contact
  onEdit: (c: Contact) => void
  onToggleSync: (c: Contact) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[hsl(var(--surface))] group transition-colors">
      <Avatar name={contact.name} isGroup={contact.isGroup} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[hsl(var(--text))] truncate">{contact.name}</span>
          {contact.tags?.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--text-3))] hidden md:inline">
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-[hsl(var(--text-3))] truncate">
          {contact.phone ? `+${contact.phone}` : contact.chatJid}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Toggle sync */}
        <button
          onClick={() => onToggleSync(contact)}
          title={contact.syncEnabled ? "Sync activo — click para desactivar" : "Sync inactivo — click para activar"}
          className={`h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${
            contact.syncEnabled
              ? "text-green-500 hover:bg-green-500/10"
              : "text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6"/><path d="M2.5 12a10 10 0 0 1 17.4-6.8L21.5 8"/><path d="M2.5 22v-6h6"/><path d="M21.5 12a10 10 0 0 1-17.4 6.8L2.5 16"/>
          </svg>
        </button>

        {/* Editar */}
        <button
          onClick={() => onEdit(contact)}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        {/* Eliminar */}
        <button
          onClick={() => onDelete(contact.id)}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[hsl(var(--text-3))] hover:bg-red-500/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
