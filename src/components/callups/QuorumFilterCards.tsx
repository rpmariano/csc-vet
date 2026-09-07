import { triggerHaptic } from '../../utils/haptics'

export type CallupFilter = 'all' | 'confirmed' | 'called' | 'declined'

interface QuorumFilterCardsProps {
  totalCount: number
  confirmedCount: number
  pendingCount: number
  declinedCount: number
  activeFilter: CallupFilter
  onSelect: (filter: CallupFilter) => void
}

/**
 * O quórum de uma convocatória (ecrã 2f): quantos confirmaram, quantos
 * recusaram, quantos ainda não responderam — e cada número é o filtro da
 * lista que vem por baixo.
 *
 * O handoff mostra três mosaicos; aqui são quatro, porque o "Todos" é o que
 * desfaz o filtro. Sem ele, escolher um número era uma viagem só de ida.
 *
 * Partilhado entre o detalhe do evento na Agenda e o dossier de convocatória
 * na Gestão de Eventos. A Gestão tinha, além destes cartões, uma segunda fila
 * de separadores a fazer o mesmo filtro; foi absorvida aqui.
 */

const MOSAICOS = [
  { chave: 'all', etiqueta: 'Todos', cor: 'text-csc-gold', fundoAtivo: 'bg-csc-gold/18 border-csc-gold/45' },
  { chave: 'confirmed', etiqueta: 'Confirmados', cor: 'text-csc-verde-texto', fundoAtivo: 'bg-csc-light/20 border-csc-light/45' },
  { chave: 'called', etiqueta: 'Sem resposta', cor: 'text-white/60', fundoAtivo: 'bg-white/12 border-white/25' },
  { chave: 'declined', etiqueta: 'Recusaram', cor: 'text-csc-vermelho-texto', fundoAtivo: 'bg-csc-red/16 border-csc-red/40' },
] as const

export function QuorumFilterCards({
  totalCount,
  confirmedCount,
  pendingCount,
  declinedCount,
  activeFilter,
  onSelect,
}: QuorumFilterCardsProps) {
  const valores: Record<CallupFilter, number> = {
    all: totalCount,
    confirmed: confirmedCount,
    called: pendingCount,
    declined: declinedCount,
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {MOSAICOS.map(mosaico => {
        const ativo = activeFilter === mosaico.chave
        return (
          <button
            key={mosaico.chave}
            type="button"
            onClick={() => {
              triggerHaptic('selection')
              onSelect(mosaico.chave)
            }}
            aria-pressed={ativo}
            className={`min-h-14 px-2.5 py-2.5 rounded-2xl border text-left cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                ativo ? mosaico.fundoAtivo : 'bg-white/5 border-white/10'
              }`}
          >
            <span
              className={`block font-display font-extrabold text-[8px] tracking-[0.1em] uppercase leading-tight ${mosaico.cor}`}
            >
              {mosaico.etiqueta}
            </span>
            <span className="block font-display font-extrabold text-[19px] text-white mt-1 tabular-nums">
              {valores[mosaico.chave]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
