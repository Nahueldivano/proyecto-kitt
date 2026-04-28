// =============================================================
// Parser de artefactos inline (formato XML dentro del texto)
// Convive con el sistema de artefactos por tool (create_artifact).
// =============================================================

export type InlineArtifactType = "html" | "react" | "svg" | "markdown"

export interface InlineArtifact {
  id: string
  type: InlineArtifactType
  title: string
  code: string
}

export interface ParsedResponse {
  text: string
  artifacts: InlineArtifact[]
}

const ARTIFACT_REGEX =
  /<artifact\s+type="(html|react|svg|markdown)"\s+title="([^"]+)">([\s\S]*?)<\/artifact>/g

let counter = 0
function nextId(): string {
  counter += 1
  return `art-${Date.now().toString(36)}-${counter}`
}

export function parseResponseWithArtifacts(raw: string): ParsedResponse {
  if (!raw || !raw.includes("<artifact")) {
    return { text: raw ?? "", artifacts: [] }
  }

  const artifacts: InlineArtifact[] = []
  let cleanText = raw

  cleanText = cleanText.replace(ARTIFACT_REGEX, (_match, type, title, code) => {
    const artifact: InlineArtifact = {
      id: nextId(),
      type: type as InlineArtifactType,
      title: title as string,
      code: (code as string).trim(),
    }
    artifacts.push(artifact)
    return `\n[📎 ${artifact.title}]\n`
  })

  return { text: cleanText.trim(), artifacts }
}
