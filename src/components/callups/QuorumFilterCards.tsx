import { Mosaicos } from '../ui/Mosaicos'

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
 * lista que vem por baixo. Tocar no aceso volta a "Todos" (`<Mosaicos>`).
 *
 * O handoff mostra três mosaicos; aqui são quatro, porque o "Todos" é o total
 * da convocatória.
 */
export function QuorumFilterCards({
  totalCount,
  confirmedCount,
  pendingCount,
  declinedCount,
  activeFilter,
  onSelect,
}: QuorumFilterCardsProps) {
  return (
    <Mosaicos<CallupFilter>
      todos="all"
      ativo={activeFilter}
      aoEscolher={chave => onSelect(chave ?? 'all')}
      mosaicos={[
        { chave: 'all', etiqueta: 'Todos', valor: totalCount, cor: 'text-csc-gold', fundoAtivo: 'bg-csc-gold/18 border-csc-gold/45' },
        { chave: 'confirmed', etiqueta: 'Confirmados', valor: confirmedCount, cor: 'text-csc-verde-texto', fundoAtivo: 'bg-csc-light/20 border-csc-light/45' },
        { chave: 'called', etiqueta: 'Sem resposta', valor: pendingCount, cor: 'text-white/60', fundoAtivo: 'bg-white/12 border-white/25' },
        { chave: 'declined', etiqueta: 'Recusaram', valor: declinedCount, cor: 'text-csc-vermelho-texto', fundoAtivo: 'bg-csc-red/16 border-csc-red/40' },
      ]}
    />
  )
}
