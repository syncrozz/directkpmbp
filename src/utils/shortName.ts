const HONORIFICS = new Set([
  'hj', 'hjh', 'haji', 'hajah', 'tn', 'puan', 'cik', 'encik', 'en', 'pn',
  'ir', 'ts', 'gs', 'sr', 'ar', 'ustaz', 'ustazah', 'dato', 'datuk', 'datin',
  "dato'", 'tan', 'sri', 'prof', 'madya', 'dr',
]);
const KEEP_TITLES = new Set(['dr', 'prof', 'ir', 'ts']);
const LINEAGE = new Set(['bin', 'binti', 'bt', 'bte', 'b', 'bnt', 'a/l', 'a/p', 'anak']);

export function getShortName(full?: string | null): string {
  if (!full) return '';
  let s = full.split(',')[0].trim();
  s = s.replace(/\b(CMILT|AFPM)\b/gi, '').replace(/\s+/g, ' ').trim();
  s = s.split('@')[0].trim();

  const words = s.split(' ').filter(Boolean);
  const title: string[] = [];
  const core: string[] = [];
  for (const w of words) {
    const key = w.toLowerCase().replace(/\./g, '');
    if (LINEAGE.has(key)) break;
    if (HONORIFICS.has(key)) {
      if (KEEP_TITLES.has(key) && core.length === 0) title.push(w.endsWith('.') ? w : w + '.');
      continue;
    }
    core.push(w);
  }
  if (core.length === 0) return s;

  const PREFIX = new Set(['syed', 'sharifah', 'raja', 'wan', 'tengku', 'tuan']);
  const MOHD = new Set(['mohd', 'mohamad', 'muhammad', 'muhamad', 'md']);
  if (core.length >= 3 && PREFIX.has(core[0].toLowerCase()) && MOHD.has(core[1].toLowerCase().replace(/\./g, ''))) {
    core.splice(1, 1);
  }

  const n = title.length ? 1 : 2;
  return [...title, ...core.slice(0, n)].join(' ');
}
