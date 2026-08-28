import React from 'react'
import { Check, X } from 'lucide-react'

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
  { id: 'mdc', name: 'Médio Defensivo', short: 'MDC', category: 'mid', topPercent: 55, leftPercent: 50 },

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
  if (s.toLowerCase().includes('médio def') || s.toLowerCase().includes('trinco') || s.toLowerCase() === 'mdc') return 'Médio Defensivo'
  if (s.toLowerCase().includes('médio of') || s.toLowerCase().includes('10') || s.toLowerCase() === 'mco') return 'Médio Ofensivo'
  if (s.toLowerCase().includes('médio esq') || s.toLowerCase() === 'me') return 'Médio Esquerdo'
  if (s.toLowerCase().includes('médio dir') || s.toLowerCase() === 'md') return 'Médio Direito'
  if (s.toLowerCase().includes('médio centro') || s.toLowerCase() === 'médio') return 'Médio Defensivo'
  if (s.toLowerCase().includes('extremo dir') || s.toLowerCase().includes('ala dir') || s.toLowerCase() === 'ed') return 'Médio Direito'
  if (s.toLowerCase().includes('extremo esq') || s.toLowerCase().includes('ala esq') || s.toLowerCase() === 'ee') return 'Médio Esquerdo'
  if (s.toLowerCase().includes('ponta de lança') || s.toLowerCase().includes('avançado') || s.toLowerCase().includes('avancado') || s.toLowerCase() === 'pl') return 'Ponta de Lança'
  return s
}

// Converter string de posições guardadas para array
export const parsePositions = (positionStr?: string | null): string[] => {
  if (!positionStr || !positionStr.trim()) return ['Médio Defensivo']
  return positionStr
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
}

interface SoccerPitchSelectorProps {
  selectedPositions: string[]
  onChange: (positions: string[]) => void
  readOnly?: boolean
}

export const SoccerPitchSelector: React.FC<SoccerPitchSelectorProps> = ({
  selectedPositions,
  onChange,
  readOnly = false,
}) => {
  const isPosSelected = (posName: string) => {
    return selectedPositions.some(p => 
      p.toLowerCase().trim() === posName.toLowerCase().trim() ||
      normalizePositionName(p).toLowerCase() === normalizePositionName(posName).toLowerCase()
    )
  }

  const togglePosition = (posName: string) => {
    if (readOnly) return
    const normalized = normalizePositionName(posName)
    if (isPosSelected(normalized)) {
      // Remover
      const next = selectedPositions.filter(p => normalizePositionName(p) !== normalized)
      onChange(next.length > 0 ? next : ['Médio Defensivo'])
    } else {
      // Adicionar
      onChange([...selectedPositions, normalized])
    }
  }

  return (
    <div className="space-y-3">
      {/* Campo Visual */}
      <div className="relative w-full max-w-md mx-auto aspect-[4/5] bg-gradient-to-b from-emerald-800 via-emerald-700 to-emerald-900 rounded-2xl p-3 shadow-inner border-2 border-emerald-600/60 overflow-hidden select-none">
        
        {/* Linhas do Relvado (Soccer Field Markings) */}
        <div className="absolute inset-2 border-2 border-white/40 rounded-xl pointer-events-none">
          {/* Riscas de relva cortada */}
          <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(0deg,transparent,transparent_20px,black_20px,black_40px)]" />

          {/* Linha de Meio Campo */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 -translate-y-1/2" />
          {/* Círculo Central */}
          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/40 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white/60 rounded-full -translate-x-1/2 -translate-y-1/2" />

          {/* Área Superior (Ataque) */}
          <div className="absolute top-0 left-1/2 w-44 h-16 border-b-2 border-x-2 border-white/40 -translate-x-1/2 rounded-b-md" />
          <div className="absolute top-0 left-1/2 w-24 h-8 border-b-2 border-x-2 border-white/40 -translate-x-1/2" />
          <div className="absolute top-12 left-1/2 w-1.5 h-1.5 bg-white/60 rounded-full -translate-x-1/2" />

          {/* Área Inferior (Defesa / Baliza) */}
          <div className="absolute bottom-0 left-1/2 w-44 h-16 border-t-2 border-x-2 border-white/40 -translate-x-1/2 rounded-t-md" />
          <div className="absolute bottom-0 left-1/2 w-24 h-8 border-t-2 border-x-2 border-white/40 -translate-x-1/2" />
          <div className="absolute bottom-12 left-1/2 w-1.5 h-1.5 bg-white/60 rounded-full -translate-x-1/2" />
          <div className="absolute bottom-16 left-1/2 w-20 h-8 border-t-2 border-white/40 rounded-t-full -translate-x-1/2" />
        </div>

        {/* Indicador de Seleção no Topo */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-xs text-csc-gold text-[10px] font-black px-2.5 py-0.5 rounded-full border border-white/15 z-10">
          <span>{selectedPositions.length} {selectedPositions.length === 1 ? 'posição' : 'posições'}</span>
        </div>

        {/* Nós Interativos de Posição */}
        {PITCH_POSITIONS.map((pos) => {
          const selected = isPosSelected(pos.name)

          return (
            <button
              key={pos.id}
              type="button"
              disabled={readOnly}
              onClick={() => togglePosition(pos.name)}
              style={{
                top: `${pos.topPercent}%`,
                left: `${pos.leftPercent}%`,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-all duration-200 z-20 ${
                readOnly ? 'cursor-default' : 'cursor-pointer active:scale-95'
              }`}
            >
              {/* Círculo do Jogador */}
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                  selected
                    ? 'bg-csc-gold text-csc-dark ring-4 ring-yellow-300 scale-110 shadow-xl'
                    : 'bg-white/90 text-gray-800 hover:bg-white hover:scale-105 border border-white/60'
                }`}
              >
                {selected ? (
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[11px] font-black">{pos.short}</span>
                    <Check size={9} className="stroke-[3.5] -mt-0.5" />
                  </div>
                ) : (
                  <span>{pos.short}</span>
                )}
              </div>

              {/* Rótulo da Posição */}
              <span
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded mt-1 whitespace-nowrap shadow-xs transition-colors ${
                  selected
                    ? 'bg-black/85 text-csc-gold border border-csc-gold/40'
                    : 'bg-black/55 text-white group-hover:bg-black/75'
                }`}
              >
                {pos.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Resumo de Posições Selecionadas com Botões de Remoção */}
      <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">Posições Atribuídas ({selectedPositions.length}):</span>
          <span className="text-[10px] text-gray-400 font-semibold">Clica no campo para alternar</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedPositions.map((pos, idx) => (
            <span
              key={idx}
              className="bg-csc-dark text-white text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs"
            >
              <span>{pos}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => togglePosition(pos)}
                  className="p-0.5 hover:bg-white/20 rounded-full transition-colors"
                  title="Remover posição"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SoccerPitchSelector
