import { parseDescription } from '@/lib/description'

// Job description with real structure (headings, bullets, paragraphs) so it can
// be scanned on a phone instead of read word by word. Content is untrusted
// crawled text; React renders every string escaped.
export default function Description({ text }: { text: string }) {
  const blocks = parseDescription(text)
  return (
    <div className="mt-1 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return (
            <h4 key={i} className="mb-1 mt-4 text-sm font-semibold text-zinc-900 first:mt-1 dark:text-zinc-100">
              {b.text}
            </h4>
          )
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="mb-3 list-disc space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="mb-3">
            {b.text}
          </p>
        )
      })}
    </div>
  )
}
