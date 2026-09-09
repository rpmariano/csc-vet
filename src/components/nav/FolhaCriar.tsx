import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Swords, Dumbbell, PartyPopper, Megaphone, Trophy, Plus, type LucideIcon } from 'lucide-react'
import { BottomSheet } from '../BottomSheet'
import { triggerHaptic } from '../../utils/haptics'

/**
 * A folha do [+] — as cinco coisas que treinador e direção criam.
 *
 * Substitui o antigo "Gestão de Eventos" como porta de entrada: criar deixou
 * de ser um sítio onde se entra e passou a ser um gesto disponível de
 * qualquer ecrã.
 *
 * Cada opção leva à página que já sabe criar essa entidade, com a intenção no
 * endereço (`?criar=…`). As páginas ainda não leem esse parâmetro — passam a
 * lê-lo quando forem redesenhadas (Agenda na fase 3, Clube na fase 6); até lá
 * abrem na lista, que é onde o botão de criar está hoje. O endereço já é o
 * definitivo, para não haver que voltar aqui.
 */

interface OpcaoCriar {
  etiqueta: string
  descricao: string
  destino: string
  Icone: LucideIcon
  /** Só a direção e o treinador têm tudo; o comunicado é o mesmo para ambos. */
  cor: string
}

const OPCOES: readonly OpcaoCriar[] = [
  {
    etiqueta: 'Jogo',
    descricao: 'Convocatória a seguir a guardar',
    destino: '/events?criar=match',
    Icone: Swords,
    cor: 'text-csc-gold',
  },
  {
    etiqueta: 'Treino',
    descricao: 'Convocatória automática de todos os aptos',
    destino: '/events?criar=practice',
    Icone: Dumbbell,
    cor: 'text-csc-verde-texto',
  },
  {
    etiqueta: 'Convívio',
    descricao: 'Jantar, torneio interno, confraternização',
    destino: '/events?criar=gathering',
    Icone: PartyPopper,
    cor: 'text-csc-azul-texto',
  },
  {
    etiqueta: 'Comunicado',
    descricao: 'Aviso a toda a equipa',
    destino: '/announcements?criar=1',
    Icone: Megaphone,
    cor: 'text-csc-gold',
  },
  {
    etiqueta: 'Jornada',
    descricao: 'Nova jornada de um torneio',
    destino: '/clube?ver=torneios&criar=jornada',
    Icone: Trophy,
    cor: 'text-csc-verde-texto',
  },
]

export interface FolhaCriarProps {
  isOpen: boolean
  onClose: () => void
}

export const FolhaCriar: React.FC<FolhaCriarProps> = ({ isOpen, onClose }) => {
  const navegar = useNavigate()

  const escolher = (destino: string) => {
    triggerHaptic('light')
    onClose()
    navegar(destino)
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Criar"
      description="O que queres marcar?"
      tone="dark"
      size="md"
      icon={
        <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
          <Plus size={18} />
        </div>
      }
    >
      <div className="space-y-2">
        {OPCOES.map(opcao => (
          <button
            key={opcao.etiqueta}
            type="button"
            onClick={() => escolher(opcao.destino)}
            className="cartao-simples w-full min-h-14 flex items-center gap-3.5 px-4 py-3 text-left cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <opcao.Icone size={20} strokeWidth={2} className={`shrink-0 ${opcao.cor}`} />
            <span className="min-w-0 flex-1">
              <span className="block font-display font-extrabold text-sm text-white">{opcao.etiqueta}</span>
              <span className="block text-[11px] leading-snug text-white/62 mt-0.5">{opcao.descricao}</span>
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

export default FolhaCriar
