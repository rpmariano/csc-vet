import React from 'react'
import { Link } from 'react-router-dom'
import {
  Landmark,
  Megaphone,
  CalendarPlus,
  Trophy,
  MapPin,
  Shield,
  Lock,
  Users,
  ClipboardList,
  UserCircle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { CabecalhoEcra, EtiquetaSeccao, CartaoSimples } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { CLUBE_NOME } from '../lib/clube'

/**
 * Clube — o quarto lugar da barra de quem gere.
 *
 * Substitui o Backoffice como porta de entrada. A diferença não é de nome: o
 * Backoffice era um sítio à parte, com a sua própria navegação lá dentro;
 * o Clube é uma lista de destinos, e o que é de gestão fica num bloco à
 * parte, marcado com 🔒, para se perceber de relance o que é consulta e o
 * que mexe na vida do clube.
 *
 * Nesta fase o ecrã é o índice: as entradas levam às páginas que já existem.
 * A fase 6 desmembra o `AdminDashboard` e traz os torneios, os adversários e
 * os campos para aqui dentro, em vez de os deixar numa página só.
 *
 * A entrada da Competição não está no mapa de navegação do handoff, que aqui
 * só lista "Fichas de jogo" — mas o README promete que o treinador tem tudo o
 * que o jogador tem, e a barra dele não tem lugar para a Competição. Sem esta
 * entrada, quem gere perdia as classificações e as estatísticas que a sidebar
 * antiga lhe dava.
 */

interface Entrada {
  para: string
  titulo: string
  descricao: string
  Icone: LucideIcon
  /** Só a direção. */
  soDirecao?: boolean
}

const EQUIPA: readonly Entrada[] = [
  {
    para: '/team-management',
    titulo: 'Plantel',
    descricao: 'Fichas, posições e estado dos atletas',
    Icone: Users,
  },
  {
    para: '/competicao',
    titulo: 'Competição',
    descricao: 'Classificações, fichas de jogo e estatísticas',
    Icone: ClipboardList,
  },
  {
    para: '/announcements',
    titulo: 'Comunicados',
    descricao: 'Publicar e editar os avisos à equipa',
    Icone: Megaphone,
  },
  {
    para: '/settings',
    titulo: 'O meu perfil',
    descricao: 'A minha ficha, estado físico e conta',
    Icone: UserCircle,
  },
]

const GESTAO: readonly Entrada[] = [
  {
    para: '/events',
    titulo: 'Eventos e convocatórias',
    descricao: 'Criar jogos, treinos e convívios; convocar',
    Icone: CalendarPlus,
  },
  {
    para: '/admin',
    titulo: 'Torneios e jornadas',
    descricao: 'Competições, grupos, equipas e jogos',
    Icone: Trophy,
  },
  {
    para: '/admin',
    titulo: 'Adversários e campos',
    descricao: 'Clubes que defrontamos e onde se joga',
    Icone: MapPin,
  },
  {
    para: '/admin',
    titulo: 'Dados do clube',
    descricao: 'Nome, emblema, campo de casa',
    Icone: Shield,
  },
  {
    para: '/finance',
    titulo: 'Financeiro e quotas',
    descricao: 'Quotas, encargos, despesas e receitas',
    Icone: Landmark,
    soDirecao: true,
  },
]

const LinhaEntrada: React.FC<{ entrada: Entrada }> = ({ entrada }) => (
  <CartaoSimples
    como={Link}
    to={entrada.para}
    onClick={() => triggerHaptic('light')}
    className="min-h-14 flex items-center gap-3.5 px-4 py-3 cursor-pointer
      transition-transform duration-150 active:scale-97
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
  >
    <entrada.Icone size={20} strokeWidth={2} className="shrink-0 text-csc-gold" />
    <span className="min-w-0 flex-1">
      <span className="block font-display font-extrabold text-sm text-white">{entrada.titulo}</span>
      <span className="block text-[11px] leading-snug text-white/55 mt-0.5">{entrada.descricao}</span>
    </span>
    <ChevronRight size={16} className="shrink-0 text-white/35" />
  </CartaoSimples>
)

const ClubePage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const eDirecao = profile?.role === 'admin'

  const gestaoVisivel = GESTAO.filter(e => !e.soDirecao || eDirecao)

  return (
    <div className="relative">
      <CabecalhoEcra
        titulo="Clube"
        legenda={clubSettings?.name ?? CLUBE_NOME}
        className="mb-5"
      />

      <section className="mb-6">
        <EtiquetaSeccao className="mb-2.5">Equipa</EtiquetaSeccao>
        <div className="space-y-2">
          {EQUIPA.map(entrada => (
            <LinhaEntrada key={entrada.titulo} entrada={entrada} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Lock size={11} className="text-csc-gold" />
          <EtiquetaSeccao como="h2">Gestão</EtiquetaSeccao>
        </div>
        <div className="space-y-2">
          {gestaoVisivel.map(entrada => (
            <LinhaEntrada key={entrada.titulo} entrada={entrada} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default ClubePage
