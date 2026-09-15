import { getResume } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

// Streams the stored résumé PDF back for download / preview.
export async function GET() {
  const row = await getResume()
  if (!row) {
    return new Response('No résumé uploaded', { status: 404 })
  }
  const bytes = Buffer.from(row.dataBase64, 'base64')
  return new Response(bytes, {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Disposition': `inline; filename="${row.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
