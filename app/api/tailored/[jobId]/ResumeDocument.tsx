import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Minimal Markdown → react-pdf renderer. Handles the subset our tailoring
// prompt emits: # name, ## sections, bullets, and paragraphs. Clean, consistent
// template (intentionally not a clone of the original résumé formatting).

const styles = StyleSheet.create({
  page: { paddingVertical: 44, paddingHorizontal: 52, fontSize: 10.5, lineHeight: 1.4, color: '#18181b', fontFamily: 'Helvetica' },
  name: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  contact: { fontSize: 9.5, color: '#52525b', marginBottom: 10 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4, borderBottom: '1px solid #d4d4d8', paddingBottom: 2 },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  para: { marginBottom: 3 },
  bulletRow: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
})

// Strip inline markdown markers we don't render as styles.
function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .trim()
}

export default function ResumeDocument({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const nodes: React.ReactNode[] = []
  let contactRendered = false

  lines.forEach((line, i) => {
    const t = line.trim()
    if (!t) return
    if (t.startsWith('# ')) {
      nodes.push(
        <Text key={i} style={styles.name}>
          {clean(t.slice(2))}
        </Text>,
      )
      return
    }
    if (t.startsWith('## ')) {
      nodes.push(
        <Text key={i} style={styles.h2}>
          {clean(t.slice(3)).toUpperCase()}
        </Text>,
      )
      return
    }
    if (t.startsWith('### ')) {
      nodes.push(
        <Text key={i} style={styles.h3}>
          {clean(t.slice(4))}
        </Text>,
      )
      return
    }
    if (/^[-*•]\s+/.test(t)) {
      nodes.push(
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{clean(t.replace(/^[-*•]\s+/, ''))}</Text>
        </View>,
      )
      return
    }
    // First non-heading paragraph right after the name is treated as contact.
    if (!contactRendered && nodes.length === 1) {
      contactRendered = true
      nodes.push(
        <Text key={i} style={styles.contact}>
          {clean(t)}
        </Text>,
      )
      return
    }
    nodes.push(
      <Text key={i} style={styles.para}>
        {clean(t)}
      </Text>,
    )
  })

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {nodes}
      </Page>
    </Document>
  )
}
