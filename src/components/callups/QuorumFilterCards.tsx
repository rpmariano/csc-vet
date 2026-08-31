import { CheckCircle2, Clock, ListChecks, XCircle } from 'lucide-react'

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
 * Os 4 cartões de resumo de quórum (Todos / Confirmados / Pendentes / Recusados), clicáveis
 * para filtrar a lista de convocados. Partilhado entre o modal de evento da Agenda e o modal
 * de RSVP da Gestão de Eventos. A Gestão de Eventos tinha, além destes cartões, uma segunda
 * fila de separadores (incluindo "Todos") a fazer exatamente o mesmo filtro — foi absorvida
 * aqui como um 4º cartão em vez de duas UIs redundantes para a mesma ação.
 */
export function QuorumFilterCards({ totalCount, confirmedCount, pendingCount, declinedCount, activeFilter, onSelect }: QuorumFilterCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
      <button
        type="button"
        onClick={() => onSelect('all')}
        title="Ver Todos"
        className={`p-2 sm:p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'all' ? 'bg-csc-gold/20 border-csc-gold shadow-md ring-2 ring-csc-gold/40' : 'bg-white/5 border-white/15 hover:bg-white/10'
        }`}
      >
        <p className="text-lg sm:text-2xl font-black text-csc-gold">{totalCount}</p>
        <p className="text-[9px] sm:text-[11px] font-bold text-white/80 flex items-center justify-center gap-1 mt-0.5">
          <ListChecks size={12} /> Todos
        </p>
      </button>

      <button
        type="button"
        onClick={() => onSelect('confirmed')}
        title="Filtrar por Confirmados"
        className={`p-2 sm:p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'confirmed' ? 'bg-emerald-500/20 border-emerald-400 shadow-md ring-2 ring-emerald-400/40' : 'bg-emerald-500/10 border-emerald-400/20 hover:bg-emerald-500/15'
        }`}
      >
        <p className="text-lg sm:text-2xl font-black text-emerald-300">{confirmedCount}</p>
        <p className="text-[9px] sm:text-[11px] font-bold text-emerald-200 flex items-center justify-center gap-1 mt-0.5">
          <CheckCircle2 size={12} /> Confirmados
        </p>
      </button>

      <button
        type="button"
        onClick={() => onSelect('called')}
        title="Filtrar por Pendentes"
        className={`p-2 sm:p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'called' ? 'bg-amber-500/20 border-amber-400 shadow-md ring-2 ring-amber-400/40' : 'bg-amber-500/10 border-amber-400/20 hover:bg-amber-500/15'
        }`}
      >
        <p className="text-lg sm:text-2xl font-black text-amber-300">{pendingCount}</p>
        <p className="text-[9px] sm:text-[11px] font-bold text-amber-200 flex items-center justify-center gap-1 mt-0.5">
          <Clock size={12} /> Pendentes
        </p>
      </button>

      <button
        type="button"
        onClick={() => onSelect('declined')}
        title="Filtrar por Recusados"
        className={`p-2 sm:p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'declined' ? 'bg-red-500/20 border-red-400 shadow-md ring-2 ring-red-400/40' : 'bg-red-500/10 border-red-400/20 hover:bg-red-500/15'
        }`}
      >
        <p className="text-lg sm:text-2xl font-black text-red-300">{declinedCount}</p>
        <p className="text-[9px] sm:text-[11px] font-bold text-red-200 flex items-center justify-center gap-1 mt-0.5">
          <XCircle size={12} /> Recusados
        </p>
      </button>
    </div>
  )
}
