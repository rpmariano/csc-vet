/**
 * As posições do campo: a tabela, os nomes normalizados e as siglas.
 *
 * Viviam no `SoccerPitchSelector`, que é um componente — e o Plantel e as
 * Definições importavam o desenho do campo inteiro só para saber que "Ponta de
 * Lança (Esq)" se escreve "PL". É a mesma mudança das siglas dos clubes e das
 * regras de evento: a regra sai da vista.
 */

export interface PitchPosition {
  id: string
  name: string
  short: string
  category: 'gk' | 'def' | 'mid' | 'att'
  topPercent: number
  leftPercent: number
}

export const PITCH_POSITIONS: PitchPosition[] = [
  // Linha de Ataque (2 Avançados)
  { id: 'pl_esq', name: 'Ponta de Lança (Esq)', short: 'PL', category: 'att', topPercent: 13, leftPercent: 34 },
  { id: 'pl_dir', name: 'Ponta de Lança (Dir)', short: 'PL', category: 'att', topPercent: 13, leftPercent: 66 },

  // Meio-Campo em Losango (4 Médios)
  // Vértice Superior (Apoio ao Ataque)
  { id: 'mco', name: 'Médio Ofensivo', short: 'MCO', category: 'mid', topPercent: 29, leftPercent: 50 },
  // Laterais do Losango
  { id: 'me', name: 'Médio Esquerdo', short: 'ME', category: 'mid', topPercent: 43, leftPercent: 22 },
  { id: 'md', name: 'Médio Direito', short: 'MD', category: 'mid', topPercent: 43, leftPercent: 78 },
  // Vértice Inferior (Trinco / Proteção Defensiva)
  { id: 'mdc', name: 'Médio Centro', short: 'MC', category: 'mid', topPercent: 55, leftPercent: 50 },

  // Linha Defensiva (4 Defesas - Centrais individualizados)
  { id: 'le', name: 'Lateral Esquerdo', short: 'LE', category: 'def', topPercent: 70, leftPercent: 14 },
  { id: 'dce', name: 'Defesa Central Esquerdo', short: 'DCE', category: 'def', topPercent: 72, leftPercent: 38 },
  { id: 'dcd', name: 'Defesa Central Direito', short: 'DCD', category: 'def', topPercent: 72, leftPercent: 62 },
  { id: 'ld', name: 'Lateral Direito', short: 'LD', category: 'def', topPercent: 70, leftPercent: 86 },

  // Guarda-Redes
  { id: 'gr', name: 'Guarda-redes', short: 'GR', category: 'gk', topPercent: 90, leftPercent: 50 },
]

// Normalizar nomes de posições comuns
export const normalizePositionName = (raw: string): string => {
  const s = raw.trim()
  if (s.toLowerCase().includes('guarda')) return 'Guarda-redes'
  if (s.toLowerCase().includes('lateral dir')) return 'Lateral Direito'
  if (s.toLowerCase().includes('lateral esq')) return 'Lateral Esquerdo'
  if (s.toLowerCase().includes('central esq') || s.toLowerCase() === 'dce') return 'Defesa Central Esquerdo'
  if (s.toLowerCase().includes('central dir') || s.toLowerCase() === 'dcd') return 'Defesa Central Direito'
  if (s.toLowerCase().includes('defesa central') || s.toLowerCase() === 'central') return 'Defesa Central Esquerdo'
  if (s.toLowerCase().includes('médio def') || s.toLowerCase().includes('trinco') || s.toLowerCase() === 'mdc' || s.toLowerCase() === 'mc') return 'Médio Centro'
  if (s.toLowerCase().includes('médio of') || s.toLowerCase().includes('10') || s.toLowerCase() === 'mco') return 'Médio Ofensivo'
  if (s.toLowerCase().includes('médio esq') || s.toLowerCase() === 'me') return 'Médio Esquerdo'
  if (s.toLowerCase().includes('médio dir') || s.toLowerCase() === 'md') return 'Médio Direito'
  if (s.toLowerCase().includes('médio centro') || s.toLowerCase() === 'médio') return 'Médio Centro'
  if (s.toLowerCase().includes('extremo dir') || s.toLowerCase().includes('ala dir') || s.toLowerCase() === 'ed') return 'Médio Direito'
  if (s.toLowerCase().includes('extremo esq') || s.toLowerCase().includes('ala esq') || s.toLowerCase() === 'ee') return 'Médio Esquerdo'
  if (s.toLowerCase().includes('ponta de lança') && s.toLowerCase().includes('esq')) return 'Ponta de Lança (Esq)'
  if (s.toLowerCase().includes('ponta de lança') && s.toLowerCase().includes('dir')) return 'Ponta de Lança (Dir)'
  if (s.toLowerCase().includes('ponta de lança') || s.toLowerCase().includes('avançado') || s.toLowerCase().includes('avancado') || s.toLowerCase() === 'pl') return 'Ponta de Lança (Esq)'
  return s
}

// Converter string de posições guardadas para array
/**
 * A sigla de uma posição — "Ponta de Lança (Esq)" dá "PL", como no campo.
 *
 * As listas mostravam o nome por extenso, e num plantel de vinte e oito
 * pessoas a linha de baixo era quase toda posição. Os dois pontas de lança
 * dão a mesma sigla de propósito: no campo também são os dois "PL".
 */
export const siglaDaPosicao = (raw: string): string => {
  const nome = normalizePositionName(raw)
  return PITCH_POSITIONS.find(p => p.name === nome)?.short ?? nome
}

/** As siglas de uma lista de posições, sem repetir a mesma duas vezes. */
export const siglasDasPosicoes = (posicoes: string[]): string[] =>
  Array.from(new Set(posicoes.map(siglaDaPosicao)))

export const parsePositions = (positionStr?: string | null): string[] => {
  if (!positionStr || !positionStr.trim()) return ['Médio Centro']
  return positionStr
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
}
