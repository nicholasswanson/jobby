import { renderToBuffer } from '@react-pdf/renderer'
import { getTailoring } from '@/lib/db/queries'
import ResumeDocument from './ResumeDocument'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: RouteContext<'/api/tailored/[jobId]'>) {
  const { jobId } = await ctx.params
  const id = Number(jobId)
  if (!Number.isFinite(id)) return new Response('Bad job id', { status: 400 })

  const tailoring = await getTailoring(id)
  if (!tailoring || tailoring.status !== 'ready' || !tailoring.tailoredMarkdown) {
    return new Response('Tailored résumé not ready', { status: 404 })
  }

  // ResumeDocument returns a <Document> element (what renderToBuffer expects).
  const pdf = await renderToBuffer(ResumeDocument({ markdown: tailoring.tailoredMarkdown }))

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="tailored-resume-${id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
