// The API has no brand field; derive one from the station name.
const BRANDS: [RegExp, string][] = [
  [/\bomv\b/i, 'OMV'],
  [/\bbp\b/i, 'BP'],
  [/shell/i, 'Shell'],
  [/\beni\b|\bagip\b/i, 'Eni'],
  [/\bavia\b/i, 'AVIA'],
  [/turm[oö]l/i, 'Turmöl'],
  [/\bjet\b/i, 'JET'],
  [/genol/i, 'Genol'],
  [/lagerhaus/i, 'Lagerhaus'],
  [/avanti/i, 'Avanti'],
  [/socar/i, 'SOCAR'],
  [/doppler/i, 'Doppler'],
  [/\bmmm\b/i, 'MMM'],
  [/\biq\b/i, 'IQ'],
  [/landforst/i, 'Landforst'],
  [/a1\s?tank/i, 'A1'],
  [/diskont/i, 'Diskont'],
  [/rag\.?\s?erdgas/i, 'RAG'],
  [/\bfe\s?tank/i, 'FE Tank'],
  [/\bdiesel\s?company\b/i, 'Diesel Company'],
  [/\bstroh\b/i, 'Stroh'],
  [/\bbauhaus\b/i, 'BAUHAUS'],
]

export function brandOf(name: string) {
  for (const [re, brand] of BRANDS) if (re.test(name)) return brand
  return 'Independent'
}

const PALETTE: Record<string, string> = {
  OMV: '#0b3d91',
  BP: '#009900',
  Shell: '#e5b700',
  Eni: '#f5c400',
  AVIA: '#d4001a',
  Turmöl: '#c8102e',
  JET: '#ffcc00',
  Genol: '#1f7a3a',
  Lagerhaus: '#00843d',
  Avanti: '#e30613',
  SOCAR: '#00a3e0',
  Doppler: '#003da5',
}

export function brandColor(brand: string) {
  return PALETTE[brand] ?? '#64748b'
}
