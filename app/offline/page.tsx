"use client"

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[hsl(var(--background))] p-6">
      <div className="text-center max-w-xs">
        <div className="h-16 w-16 rounded-2xl bg-[hsl(var(--surface-2))] flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[hsl(var(--text-3))]">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-[hsl(var(--text))] mb-2">Sin conexión</h1>
        <p className="text-sm text-[hsl(var(--text-3))] mb-6">
          KITT necesita internet para funcionar. Revisá tu conexión e intentá de nuevo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
