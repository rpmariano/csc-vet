import { CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react'

interface CallupRowPlayer {
  name?: string | null
  jersey_number?: number | null
  position?: string | null
}

interface CallupRowProps {
  status: 'called' | 'confirmed' | 'declined' | 'pending'
  player: CallupRowPlayer | null | undefined
  /** Já calculado no caller via getPlayerDisplayName(player). */
  displayName: string
  isCoachOrAdmin: boolean | null | undefined
  onConfirm: () => void
  onDecline: () => void
  onSetPending: () => void
  onRemove: () => void
  /**
   * Abrir a ficha rápida do convocado (ecrã 4a). Quando existe, o número e o
   * nome passam a ser um botão; as ações da direita ficam como estavam.
   */
  onOpen?: () => void
}

/**
 * Uma linha de convocado (ecrã 2f): o número da camisola num círculo, o nome,
 * e o estado da resposta numa pastilha à direita.
 *
 * Quem gere vê, no lugar da pastilha, as ações rápidas — confirmar, recusar,
 * repor por responder, tirar da convocatória. A pastilha e as ações não
 * cabem as duas: o estado lê-se no botão que está aceso.
 *
 * Partilhado entre o detalhe do evento na Agenda e o dossier de convocatória
 * na Gestão de Eventos, que reimplementavam a mesma linha de forma
 * independente.
 *
 * As ações aparecem sempre todas, mesmo a que corresponde ao estado atual: a
 * Agenda escondia-a e a Gestão mostrava-a, e mostrar sempre é mais previsível
 * — o botão aceso diz onde se está.
 */

const PASTILHAS = {
  confirmed: { texto: 'Confirmado', classe: 'bg-csc-light/16 border-csc-light/30 text-csc-verde-texto' },
  declined: { texto: 'Recusou', classe: 'bg-csc-red/12 border-csc-red/28 text-csc-vermelho-texto' },
  pendente: { texto: 'Sem resposta', classe: 'bg-white/8 border-white/14 text-white/55' },
} as const

export function CallupRow({
  status,
  player,
  displayName,
  isCoachOrAdmin,
  onConfirm,
  onDecline,
  onSetPending,
  onRemove,
  onOpen,
}: CallupRowProps) {
  const confirmado = status === 'confirmed'
  const recusou = status === 'declined'
  const pastilha = confirmado ? PASTILHAS.confirmed : recusou ? PASTILHAS.declined : PASTILHAS.pendente

  const posicoes = player?.position
    ? player.position.split(',').map(p => p.trim()).filter(Boolean)
    : []

  /** Botão de ação rápida: aceso quando é o estado em que o convocado está. */
  const acao = (
    aceso: boolean,
    aoTocar: () => void,
    titulo: string,
    Icone: typeof CheckCircle2,
    classeAceso: string,
  ) => (
    <button
      type="button"
      onClick={aoTocar}
      title={titulo}
      aria-label={titulo}
      aria-pressed={aceso}
      className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer shrink-0
        transition-transform duration-150 active:scale-97
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
          aceso ? classeAceso : 'bg-white/6 text-white/50'
        }`}
    >
      <Icone size={15} />
    </button>
  )

  /*
    O número e o nome. Com `onOpen` são um `<button>` a sério — e não um `div`
    com `onClick` — para chegarem ao teclado e ao leitor de ecrã; as ações
    rápidas ficam de fora dele, senão era um botão dentro de outro.
  */
  const identidade = (
    <>
      <span
        className="w-7 h-7 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 flex items-center justify-center
          font-display font-extrabold text-[10px] text-csc-gold flex-none"
      >
        {player?.jersey_number ?? '–'}
      </span>

      <span className="flex-1 min-w-0 text-left">
        <span className="block font-display font-bold text-xs text-white truncate">{displayName}</span>
        {posicoes.length > 0 && (
          <span className="block text-[9px] text-white/40 truncate mt-0.5">{posicoes.join(' · ')}</span>
        )}
      </span>
    </>
  )

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-white/7 first:border-t-0">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ver ${displayName} na convocatória`}
          className="flex-1 min-w-0 min-h-11 flex items-center gap-2.5 cursor-pointer text-left
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-xl"
        >
          {identidade}
        </button>
      ) : (
        <span className="flex-1 min-w-0 flex items-center gap-2.5">{identidade}</span>
      )}

      {isCoachOrAdmin ? (
        <span className="flex items-center gap-1 flex-none">
          {acao(confirmado, onConfirm, 'Marcar como confirmado', CheckCircle2, 'bg-csc-light text-white')}
          {acao(recusou, onDecline, 'Marcar como recusado', XCircle, 'bg-csc-red text-white')}
          {acao(status === 'called', onSetPending, 'Repor por responder', Clock, 'bg-white/20 text-white')}
          {acao(false, onRemove, 'Tirar da convocatória', Trash2, '')}
        </span>
      ) : (
        <span
          className={`font-display font-bold text-[9.5px] px-2 py-1 rounded-[9px] border flex-none ${pastilha.classe}`}
        >
          {pastilha.texto}
        </span>
      )}
    </div>
  )
}
