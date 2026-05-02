import { getConfig } from "@/lib/config"

// Transcribe un audio en base64 usando OpenAI Whisper.
// Devuelve null si no hay API key o si la transcripción falla.
export async function transcribeAudioBase64(
  base64: string,
  mimetype: string
): Promise<string | null> {
  const apiKey = await getConfig("openaiKey")
  if (!apiKey) return null

  try {
    const buffer = Buffer.from(base64, "base64")
    const ext = mimetype.includes("ogg")
      ? "ogg"
      : mimetype.includes("mp3") || mimetype.includes("mpeg")
        ? "mp3"
        : mimetype.includes("wav")
          ? "wav"
          : "m4a"

    const form = new FormData()
    form.append("file", new Blob([buffer], { type: mimetype }), `audio.${ext}`)
    form.append("model", "whisper-1")
    form.append("language", "es")

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!res.ok) {
      console.warn("[whisper] transcription failed:", res.status, await res.text().catch(() => ""))
      return null
    }

    const data = await res.json()
    const text = typeof data?.text === "string" ? data.text.trim() : ""
    return text || null
  } catch (err) {
    console.warn("[whisper] transcription error:", err)
    return null
  }
}
