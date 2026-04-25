"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { StatusBadge } from "./StatusBadge"
import { useChatStore } from "@/lib/store"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  title: string
  createdAt: string
  folderId?: string | null
}

interface Folder {
  id: string
  name: string
}

interface SidebarProps {
  waConnected?: boolean
  gmailConnected?: boolean
}

type MenuState = { id: string; type: "conv" | "folder"; x: number; y: number } | null

function groupByDate(convs: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Esta semana", items: [] },
    { label: "Anterior", items: [] },
  ]

  for (const c of convs) {
    if (c.folderId) continue // se muestran en carpetas
    const d = new Date(c.createdAt)
    if (d >= today) groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= weekAgo) groups[2].items.push(c)
    else groups[3].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

export function Sidebar({ waConnected = false, gmailConnected = false }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { reset, setConversationId } = useChatStore()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [menu, setMenu] = useState<MenuState>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const menuRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    const [cRes, fRes] = await Promise.all([
      fetch("/api/conversations"),
      fetch("/api/folders"),
    ])
    if (cRes.ok) {
      const d = await cRes.json()
      setConversations(d.conversations ?? [])
    }
    if (fRes.ok) {
      const d = await fRes.json()
      setFolders(d.folders ?? [])
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, pathname])

  // Cerrar menú al click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function openMenu(e: React.MouseEvent, id: string, type: "conv" | "folder") {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ id, type, x: e.clientX, y: e.clientY })
  }

  async function deleteConv(id: string) {
    setMenu(null)
    await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (pathname.includes(id)) {
      reset()
      router.push("/chat")
    }
  }

  async function deleteFolder(id: string) {
    setMenu(null)
    await fetch(`/api/folders/${id}`, { method: "DELETE" })
    await loadData()
  }

  async function renameConv(id: string, title: string) {
    setEditingId(null)
    if (!title.trim()) return
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }

  async function moveToFolder(convId: string, folderId: string | null) {
    setMenu(null)
    await fetch(`/api/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    })
    await loadData()
  }

  async function createFolder() {
    if (!newFolderName.trim()) { setNewFolderMode(false); return }
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim() }),
    })
    if (res.ok) {
      setNewFolderName("")
      setNewFolderMode(false)
      await loadData()
    }
  }

  function openConversation(id: string) {
    setConversationId(id)
    router.push("/chat")
  }

  function newConversation() {
    reset()
    router.push("/chat")
  }

  const groups = groupByDate(conversations)
  const isChat = pathname.startsWith("/chat")

  if (collapsed) {
    return (
      <aside className="hidden md:flex flex-col w-14 border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] h-full items-center py-4 gap-4">
        <button onClick={() => setCollapsed(false)} className="flex items-center justify-center">
          <Image src="/kitt-logo.png" alt="KITT" width={32} height={26} className="object-contain" />
        </button>
        <button onClick={newConversation} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]" title="Nueva conversación">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <Link href="/settings" className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]" title="Configuración">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        </Link>
      </aside>
    )
  }

  return (
    <>
      <aside className="hidden md:flex flex-col w-60 border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2">
            <Image src="/kitt-logo.png" alt="KITT" width={56} height={45} className="object-contain" />
            <div className="flex items-center gap-1.5">
              <StatusBadge connected={waConnected} showLabel={false} />
              <StatusBadge connected={gmailConnected} showLabel={false} />
            </div>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 19l-7-7 7-7"/><path d="M19 19l-7-7 7-7"/></svg>
          </button>
        </div>

        {/* Nueva conversación */}
        <div className="px-3 py-2">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))] transition-colors border border-dashed border-[hsl(var(--border-2))]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva conversación
          </button>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
          {/* Carpetas */}
          {folders.length > 0 && (
            <div>
              {folders.map((folder) => {
                const folderConvs = conversations.filter((c) => c.folderId === folder.id)
                const isExpanded = expandedFolders.has(folder.id)
                return (
                  <div key={folder.id}>
                    <div className="flex items-center gap-1 px-2 py-1.5 group">
                      <button
                        onClick={() => setExpandedFolders((prev) => {
                          const next = new Set(prev)
                          next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id)
                          return next
                        })}
                        className="flex items-center gap-1.5 flex-1 text-xs font-medium text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {isExpanded
                            ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            : <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          }
                        </svg>
                        <span className="truncate">{folder.name}</span>
                        <span className="text-[hsl(var(--text-3))]">({folderConvs.length})</span>
                      </button>
                      <button
                        onClick={(e) => openMenu(e, folder.id, "folder")}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                      </button>
                    </div>
                    {isExpanded && folderConvs.map((conv) => (
                      <ConvItem
                        key={conv.id}
                        conv={conv}
                        active={isChat}
                        editingId={editingId}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        onOpen={openConversation}
                        onMenu={openMenu}
                        onRename={renameConv}
                        indent
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* Nueva carpeta */}
          {newFolderMode ? (
            <div className="px-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setNewFolderMode(false) }}
                onBlur={createFolder}
                className="w-full text-xs bg-[hsl(var(--background))] border border-[hsl(var(--accent))] rounded px-2 py-1 outline-none text-[hsl(var(--text))]"
                placeholder="Nombre de la carpeta..."
              />
            </div>
          ) : (
            <button
              onClick={() => setNewFolderMode(true)}
              className="mx-2 flex items-center gap-1 text-xs text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nueva carpeta
            </button>
          )}

          {/* Grupos por fecha */}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={isChat}
                  editingId={editingId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onOpen={openConversation}
                  onMenu={openMenu}
                  onRename={renameConv}
                />
              ))}
            </div>
          ))}

          {conversations.length === 0 && (
            <p className="px-3 py-4 text-xs text-[hsl(var(--text-3))] text-center">
              Todavía no hay conversaciones
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[hsl(var(--border))] space-y-2">
          <div className="flex items-center justify-between">
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                  : "text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]"
              )}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
              Configuración
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-xs text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] px-1.5 py-1"
              >
                Salir
              </button>
            </div>
          </div>
          {session?.user && (
            <div className="px-1">
              <p className="text-xs font-medium text-[hsl(var(--text-2))] truncate">
                {session.user.name ?? session.user.email}
              </p>
              <p className="text-xs text-[hsl(var(--text-3))] truncate">{session.user.email}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Menú contextual */}
      {menu && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 9999 }}
          className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-xl shadow-xl py-1 min-w-[180px]"
        >
          {menu.type === "conv" && (
            <>
              <button
                onClick={() => { setEditingId(menu.id); setEditValue(conversations.find(c => c.id === menu.id)?.title ?? ""); setMenu(null) }}
                className="w-full text-left px-4 py-2 text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
              >
                Renombrar
              </button>
              {folders.length > 0 && (
                <>
                  <div className="px-4 py-1 text-[10px] text-[hsl(var(--text-3))] uppercase tracking-wider">Mover a carpeta</div>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => moveToFolder(menu.id, f.id)}
                      className="w-full text-left px-4 py-2 text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
                    >
                      {f.name}
                    </button>
                  ))}
                  {conversations.find(c => c.id === menu.id)?.folderId && (
                    <button
                      onClick={() => moveToFolder(menu.id, null)}
                      className="w-full text-left px-4 py-2 text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]"
                    >
                      Quitar de carpeta
                    </button>
                  )}
                </>
              )}
              <div className="border-t border-[hsl(var(--border))] my-1" />
              <button
                onClick={() => deleteConv(menu.id)}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10"
              >
                Eliminar
              </button>
            </>
          )}
          {menu.type === "folder" && (
            <>
              <button
                onClick={() => { setMenu(null) }}
                className="w-full text-left px-4 py-2 text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]"
              >
                Renombrar carpeta
              </button>
              <div className="border-t border-[hsl(var(--border))] my-1" />
              <button
                onClick={() => deleteFolder(menu.id)}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10"
              >
                Eliminar carpeta
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

function ConvItem({
  conv, active, editingId, editValue, setEditValue, onOpen, onMenu, onRename, indent = false
}: {
  conv: Conversation
  active: boolean
  editingId: string | null
  editValue: string
  setEditValue: (v: string) => void
  onOpen: (id: string) => void
  onMenu: (e: React.MouseEvent, id: string, type: "conv" | "folder") => void
  onRename: (id: string, title: string) => void
  indent?: boolean
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[hsl(var(--surface-2))] transition-colors",
        indent && "ml-3"
      )}
      onClick={() => onOpen(conv.id)}
    >
      {editingId === conv.id ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename(conv.id, editValue)
            if (e.key === "Escape") onRename(conv.id, editValue)
          }}
          onBlur={() => onRename(conv.id, editValue)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-xs bg-transparent border-b border-[hsl(var(--accent))] outline-none text-[hsl(var(--text))]"
        />
      ) : (
        <span className="flex-1 text-xs text-[hsl(var(--text-2))] truncate group-hover:text-[hsl(var(--text))]">
          {conv.title}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onMenu(e, conv.id, "conv") }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] flex-shrink-0"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
    </div>
  )
}
