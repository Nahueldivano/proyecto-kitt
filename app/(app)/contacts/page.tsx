"use client"

import { useEffect, useState, useCallback } from "react"

interface Contact {
  id: string
  chatJid: string
  name: string
  phone: string | null
  isGroup: boolean
  syncEnabled: boolean
}

function Avatar({ name, isGroup }: { name: string; isGroup: boolean }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
      isGroup
        ? "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
        : "bg-[hsl(var(--surface-2))] text-[hsl(var(--text-2))]"
    }`}>
      {isGroup ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ) : initial}
    </div>
  )
}

function EditModal({ contact, onSave, onDelete, onClose }: {
  contact: Contact
  onSave: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(contact.name)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave(contact.id, name.trim())
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar a "${contact.name}"?`)) return
    setDeleting(true)
    await onDelete(contact.id)
    setDeleting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full md:max-w-sm bg-[hsl(var(--surface))] rounded-t-2xl md:rounded-2xl p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} isGroup={contact.isGroup} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[hsl(var(--text-3))] truncate font-mono">
              {contact.phone ? `+${contact.phone}` : contact.chatJid}
            </p>
          </div>
          <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Nombre */}
        <div>
          <label className="text-xs font-medium text-[hsl(var(--text-2))] block mb-1.5">Nombre</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave() }}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
            autoFocus
          />
        </div>

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2.5 rounded-xl border border-red-500/30 text-red-500 text-sm hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            {deleting ? "..." : "Eliminar"}
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

  async function handleSave(id: string, name: string) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setContacts(prev => prev.map(c => c.id === id ? { ...c, name } : c))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" })
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  async function handleCleanup() {
    if (!confirm("¿Eliminar todos los contactos sin nombre real (solo números o JIDs)?")) return
    const r = await fetch("/api/contacts/cleanup", { method: "POST" })
    const d = await r.json()
    if (d.ok) await load()
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search)
    const matchFilter = filter === "all" || (filter === "groups" ? c.isGroup : !c.isGroup)
    return matchSearch && matchFilter
  })

  const groups = filtered.filter(c => c.isGroup)
  const people = filtered.filter(c => !c.isGroup)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] flex-shrink-0">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-[hsl(var(--text))]">Contactos</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--text-3))]">{contacts.length} guardados</span>
              {contacts.some(c => /^[0-9]+$/.test(c.name) || c.name.includes("@")) && (
                <button
                  onClick={handleCleanup}
                  className="text-xs text-[hsl(var(--destructive))] hover:opacity-80 transition-opacity"
                  title="Eliminar contactos sin nombre real"
                >
                  Limpiar sin nombre
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar..."
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
                    : "border-[hsl(var(--border-2))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--border))]"
                }`}
              >
                {f === "all" ? "Todos" : f === "people" ? "Personas" : "Grupos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 md:px-6 py-3">
          {loading ? (
            <div className="text-center text-sm text-[hsl(var(--text-3))] py-16">Cargando...</div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <p className="text-sm text-[hsl(var(--text))]">Sin contactos aún</p>
              <p className="text-xs text-[hsl(var(--text-3))]">Sincronizá WhatsApp para importarlos automáticamente</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.length > 0 && (filter === "all" || filter === "groups") && (
                <section>
                  <p className="text-[10px] font-semibold text-[hsl(var(--text-3))] uppercase tracking-wider px-1 mb-1.5">
                    Grupos · {groups.length}
                  </p>
                  <div className="space-y-0.5">
                    {groups.map(c => (
                      <ContactRow key={c.id} contact={c} onEdit={setEditing} />
                    ))}
                  </div>
                </section>
              )}
              {people.length > 0 && (filter === "all" || filter === "people") && (
                <section>
                  <p className="text-[10px] font-semibold text-[hsl(var(--text-3))] uppercase tracking-wider px-1 mb-1.5">
                    Personas · {people.length}
                  </p>
                  <div className="space-y-0.5">
                    {people.map(c => (
                      <ContactRow key={c.id} contact={c} onEdit={setEditing} />
                    ))}
                  </div>
                </section>
              )}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-[hsl(var(--text-3))] py-8">Sin resultados</p>
              )}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditModal
          contact={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ContactRow({ contact, onEdit }: { contact: Contact; onEdit: (c: Contact) => void }) {
  return (
    <button
      onClick={() => onEdit(contact)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[hsl(var(--surface))] transition-colors text-left"
    >
      <Avatar name={contact.name} isGroup={contact.isGroup} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[hsl(var(--text))] truncate">{contact.name}</p>
        <p className="text-xs text-[hsl(var(--text-3))] truncate">
          {contact.phone ? `+${contact.phone}` : contact.chatJid}
        </p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[hsl(var(--text-3))] shrink-0">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  )
}
