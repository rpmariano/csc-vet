import { CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react'

interface CallupRowPlayer {
  name?: string | null
  jersey_number?: number | null
}

interface CallupRowProps {
  status: 'called' | 'confirmed' | 'declined' | 'pending'
  player: CallupRowPlayer | null | undefined
  /** Já calculado no caller via extractRolesFromProfile(player) — evita acoplar este componente ao AuthContext. */
  roles: string[]
  /** Já calculado no caller via getPlayerDisplayName(player). */
  displayName: string
  isCoachOrAdmin: boolean | null | undefined
  onConfirm: () => void
  onDecline: () => void
  onSetPending: () => void
  onRemove: () => void
}

/**
 * Uma linha de convocado (estado de RSVP, nº e nome, papéis) com as ações rápidas de
 * treinador/admin. Partilhado entre o modal de evento da Agenda e o modal de RSVP da Gestão
 * de Eventos, que reimplementavam a mesma linha de forma independente (mesmo
 * handleUpdateCallupStatus chamado nos dois sítios, HTML quase idêntico).
 *
 * Nota de unificação: a Agenda escondia o botão correspondente ao estado atual (ex.: sem
 * botão "Confirmar" se já confirmado); a Gestão de Eventos mostrava sempre os três botões,
 * destacando o ativo. Ficou este segundo padrão para as duas páginas — mostra sempre as
 * ações disponíveis, é mais previsível.
 *
 * O nº de camisola aparece uma única vez, junto ao nome (não há avatar/quadrado separado
 * com o número — era redundante). O círculo de estado à esquerda é sempre o estado de RSVP
 * (confirmado/recusado/pendente), nunca o número do jogador.
 */
export function CallupRow({ status, player, roles, displayName, isCoachOrAdmin, onConfirm, onDecline, onSetPending, onRemove }: CallupRowProps) {
  const isConfirmed = status === 'confirmed'
  const isDeclined = status === 'declined'

  return (
    <div className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white hover:bg-gray-50 border border-gray-200 transition-all text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0">
          {isConfirmed ? (
            <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center" title="Confirmado">
              <CheckCircle2 size={13} />
            </div>
          ) : isDeclined ? (
            <div className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center" title="Recusado">
              <XCircle size={13} />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center" title="Pendente — ainda não respondeu">
              <Clock size={13} />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="font-extrabold text-gray-900 truncate flex items-center gap-1">
            {player?.jersey_number && (
              <span className="text-gray-500 text-[10px] font-bold">#{player.jersey_number}</span>
            )}
            <span className="truncate">{displayName}</span>
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {roles.map(r => (
              <span key={r} className="text-[8.5px] font-black px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                {r === 'admin' ? 'Admin' : r === 'coach' ? 'Treinador' : 'Jogador'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {isCoachOrAdmin && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onConfirm}
            title="Marcar como Confirmado"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isConfirmed ? 'bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-emerald-100 text-emerald-600 border border-gray-200'}`}
          >
            <CheckCircle2 size={13} />
          </button>
          <button
            type="button"
            onClick={onDecline}
            title="Marcar como Recusado"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDeclined ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-red-100 text-red-600 border border-gray-200'}`}
          >
            <XCircle size={13} />
          </button>
          <button
            type="button"
            onClick={onSetPending}
            title="Colocar como Pendente"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${status === 'called' ? 'bg-amber-600 text-white' : 'bg-gray-100 hover:bg-amber-100 text-amber-600 border border-gray-200'}`}
          >
            <Clock size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remover da Convocatória"
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
