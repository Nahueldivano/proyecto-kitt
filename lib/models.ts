// =============================================================
// Modelos de IA disponibles en KITT
// Este archivo se puede importar en el client (no tiene deps de server)
// =============================================================

export const DEFAULT_MODEL = "claude-sonnet-4-5-20251001"

export interface AIModel {
  id: string
  name: string
  description: string
}

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    description: "Más rápido y económico — ideal para consultas simples",
  },
  {
    id: "claude-sonnet-4-5-20251001",
    name: "Claude Sonnet 4.5",
    description: "Equilibrio entre capacidad y velocidad (recomendado)",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Mayor capacidad de razonamiento",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    description: "Máxima capacidad — para tareas complejas",
  },
]
