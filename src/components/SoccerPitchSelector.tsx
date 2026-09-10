import React from 'react'
import { Check, X } from 'lucide-react'
import { PITCH_POSITIONS, normalizePositionName } from '../lib/posicoes'

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
      onChange(next.length > 0 ? next : ['Médio Centro'])
    } else {
      // Adicionar
      onChange([...selectedPositions, normalized])
    }
  }

  return (
    <div className="space-y-3">
      {/* Campo Visual */}
      <div className="relative w-full max-w-md mx-auto aspect-[4/5] bg-gradient-to-b from-[#16601f] via-[#12511a] to-[#0d3b13] rounded-2xl p-3 shadow-inner border border-csc-light/35 overflow-hidden select-none">
        
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
                    ? 'bg-csc-gold text-csc-tinta ring-2 ring-csc-gold/50 scale-110'
                    : 'bg-white/85 text-csc-tinta hover:bg-white border border-white/60'
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

              {/*
                Sem rótulo por baixo do círculo. Estavam lá os onze nomes por
                extenso ao mesmo tempo e, numa coluna de 480px, sobrepunham-se
                uns aos outros — "Ponta de Lança (Esq)" por cima de "Ponta de
                Lança (Dir)", e não se lia nenhum. A sigla dentro do círculo
                identifica o lugar, e as posições atribuídas estão por extenso
                na lista debaixo do campo.
              */}
            </button>
          )
        })}
      </div>

      {/* Resumo de Posições Selecionadas com Botões de Remoção */}
      <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/80">Posições Atribuídas ({selectedPositions.length}):</span>
          {/* Só quando dá mesmo para clicar: na ficha do atleta o campo é só
              de leitura, e a dica convidava a um gesto que não faz nada. */}
          {!readOnly && (
            <span className="text-[10px] text-white/62 font-semibold">Clica no campo para alternar</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedPositions.map((pos, idx) => (
            <span
              key={idx}
              className="bg-csc-gold/15 border border-csc-gold/30 text-csc-gold text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5"
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
