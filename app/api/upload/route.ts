import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Archivo muy grande (máx 20MB)" }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const mimeType = file.type
    const fileName = file.name

    let extractedText = ""

    // PDF
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (await import("pdf-parse")) as any
      const data = await (pdfParse.default ?? pdfParse)(buffer)
      extractedText = data.text
    }
    // Excel
    else if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
    ) {
      const XLSX = await import("xlsx")
      const workbook = XLSX.read(buffer, { type: "buffer" })
      const lines: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        lines.push(`--- Hoja: ${sheetName} ---`)
        lines.push(XLSX.utils.sheet_to_csv(sheet))
      }
      extractedText = lines.join("\n")
    }
    // Word DOCX
    else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      extractedText = result.value
    }
    // Imágenes — devolver base64 para que Claude lo procese con visión
    else if (mimeType.startsWith("image/")) {
      const base64 = buffer.toString("base64")
      return NextResponse.json({
        name: fileName,
        type: "image",
        mimeType,
        content: base64,
        size: file.size,
      })
    }
    // Texto plano
    else if (mimeType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
      extractedText = buffer.toString("utf-8")
    }
    else {
      return NextResponse.json({ error: "Formato no soportado" }, { status: 400 })
    }

    // Limitar texto extraído
    const truncated = extractedText.length > 50_000
      ? extractedText.slice(0, 50_000) + "\n\n[... texto truncado por longitud ...]"
      : extractedText

    return NextResponse.json({
      name: fileName,
      type: "text",
      content: truncated,
      size: file.size,
    })
  } catch (err) {
    console.error("[upload] error:", err)
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}
