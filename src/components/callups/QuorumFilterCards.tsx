import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react'

export type CallupFilter = 'all' | 'confirmed' | 'called' | 'declined'

interface QuorumFilterCardsProps {
  confirmedCount: number
  pendingCount: number
  declinedCount: number
  activeFilter: CallupFilter
  /** O próprio caller decide o toggle (voltar a 'all' se já estava ativo) — mantém o comportamento de cada página. */
  onSelect: (filter: 'confirmed' | 'called' | 'declined') => void
}

/**
 * Os 3 cartões de resumo de quórum (Confirmados / Pendentes / Recusados), clicáveis para
 * filtrar a lista de convocados. Partilhado entre o modal de evento da Agenda e o modal de
 * RSVP da Gestão de Eventos — eram duas cópias quase idênticas que já tinham convergido no
 * mesmo aspeto visual depois do tema CSC Dark & Gold.
 */
export function QuorumFilterCards({ confirmedCount, pendingCount, declinedCount, activeFilter, onSelect }: QuorumFilterCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => onSelect('confirmed')}
        title="Filtrar por Confirmados"
        className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'confirmed' ? 'bg-emerald-500/20 border-emerald-400 shadow-md ring-2 ring-emerald-400/40' : 'bg-emerald-500/10 border-emerald-400/20 hover:bg-emerald-500/15'
        }`}
      >
        <p className="text-2xl font-black text-emerald-300">{confirmedCount}</p>
        <p className="text-[11px] font-bold text-emerald-200 flex items-center justify-center gap-1 mt-0.5">
          <CheckCircle2 size={12} /> Confirmados
        </p>
        {activeFilter === 'confirmed' && (
          <span className="text-[9px] font-black uppercase text-emerald-200 bg-emerald-400/20 px-1.5 py-0.2 rounded-full mt-1">
            Filtro Ativo
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onSelect('called')}
        title="Filtrar por Pendentes"
        className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'called' ? 'bg-amber-500/20 border-amber-400 shadow-md ring-2 ring-amber-400/40' : 'bg-amber-500/10 border-amber-400/20 hover:bg-amber-500/15'
        }`}
      >
        <p className="text-2xl font-black text-amber-300">{pendingCount}</p>
        <p className="text-[11px] font-bold text-amber-200 flex items-center justify-center gap-1 mt-0.5">
          <HelpCircle size={12} /> Pendentes
        </p>
        {activeFilter === 'called' && (
          <span className="text-[9px] font-black uppercase text-amber-200 bg-amber-400/20 px-1.5 py-0.2 rounded-full mt-1">
            Filtro Ativo
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onSelect('declined')}
        title="Filtrar por Recusados"
        className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
          activeFilter === 'declined' ? 'bg-red-500/20 border-red-400 shadow-md ring-2 ring-red-400/40' : 'bg-red-500/10 border-red-400/20 hover:bg-red-500/15'
        }`}
      >
        <p className="text-2xl font-black text-red-300">{declinedCount}</p>
        <p className="text-[11px] font-bold text-red-200 flex items-center justify-center gap-1 mt-0.5">
          <XCircle size={12} /> Recusados
        </p>
        {activeFilter === 'declined' && (
          <span className="text-[9px] font-black uppercase text-red-200 bg-red-400/20 px-1.5 py-0.2 rounded-full mt-1">
            Filtro Ativo
          </span>
        )}
      </button>
    </div>
  )
}
