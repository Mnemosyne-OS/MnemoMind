/**
 * styles — the cartridge's inline styles, on the host's design tokens only
 * (rule 12: `var(--…)`, never a hard colour). Kept out of the .tsx files so
 * each of those exports a component and nothing else (Fast Refresh).
 */
import type { CSSProperties } from 'react';

/** The cartridge's inline styles, on the host's design tokens only. */
export const S: Record<string, CSSProperties> = {
  page: { height: '100%', overflow: 'auto', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-void)', color: 'var(--text-primary)' },
  header: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 20, fontWeight: 600 },
  h2: { fontSize: 15, fontWeight: 600, margin: 0 },
  p: { margin: 0, lineHeight: 1.5 },
  muted: { color: 'var(--text-muted)' },
  small: { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45 },
  error: { color: 'var(--danger, var(--accent))', fontSize: 13 },
  card: { background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  button: { alignSelf: 'flex-start', background: 'var(--accent)', color: 'var(--text-on-accent, var(--bg-void))', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontWeight: 500 },
  ghost: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' },
  link: { background: 'transparent', color: 'var(--accent)', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' },
  input: { background: 'var(--bg-void)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 9px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  lawTile: { background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-primary)' },
  countryCard: { background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  addCard: { background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  countryName: { fontSize: 16, fontWeight: 600 },
  article: { borderTop: '1px solid var(--border-subtle)', paddingTop: 6 },
  articleHead: { background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', padding: 0, fontWeight: 500 },
  text: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, margin: '6px 0' },
  preview: { background: 'var(--bg-void)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 10px', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 },
  footer: { marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 },
};
