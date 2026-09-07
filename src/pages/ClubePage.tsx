import React, { useEffect, useState } from 'react'
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
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { CabecalhoEcra, EtiquetaSeccao, CartaoSimples } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { CLUBE_NOME } from '../lib/clube'
import { supabase } from '../lib/supabaseClient'

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
    para: '/admin?ver=tournaments',
    titulo: 'Torneios e jornadas',
    descricao: 'Competições, grupos, equipas e jogos',
    Icone: Trophy,
  },
  {
    para: '/admin?ver=opponents',
    titulo: 'Adversários e campos',
    descricao: 'Clubes que defrontamos e onde se joga',
    Icone: MapPin,
  },
  {
    para: '/admin?ver=club',
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

const LinhaEntrada: React.FC<{ entrada: Entrada; contagem?: string }> = ({ entrada, contagem }) => (
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
      <span className="block text-[11px] leading-snug text-white/55 mt-0.5">
        {contagem ?? entrada.descricao}
      </span>
    </span>
    <ChevronRight size={16} className="shrink-0 text-white/35" />
  </CartaoSimples>
)

const ClubePage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const eDirecao = profile?.role === 'admin'

  const gestaoVisivel = GESTAO.filter(e => !e.soDirecao || eDirecao)

  /*
    Os três números do topo (ecrã 6a): quantos somos, quantos jogos se
    fizeram, quantas provas estão a decorrer. São a primeira coisa do ecrã no
    handoff, e são também o que diz de relance se há alguma coisa por tratar.

    A contagem de atletas vem de `v_players_public` e não de `profiles`: é
    plantel, e a vista é a que qualquer autenticado pode ler.
  */
  const [numeros, setNumeros] = useState<{ atletas: number; jogos: number; torneios: number } | null>(null)
  const [campoPrincipal, setCampoPrincipal] = useState<{ name: string; address: string | null } | null>(null)

  useEffect(() => {
    let cancelado = false

    const carregar = async () => {
      const [atletas, jogos, torneios] = await Promise.all([
        supabase.from('v_players_public').select('id', { count: 'exact', head: true }).neq('status', 'inactive'),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('type', 'match').lt('date_time', new Date().toISOString()),
        supabase.from('tournaments').select('id', { count: 'exact', head: true }).neq('status', 'terminado'),
      ])
      if (cancelado) return
      setNumeros({
        atletas: atletas.count ?? 0,
        jogos: jogos.count ?? 0,
        torneios: torneios.count ?? 0,
      })
    }

    carregar()
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    let cancelado = false
    const id = clubSettings?.home_field_id
    if (!id) {
      setCampoPrincipal(null)
      return
    }
    supabase.from('fields').select('name, address').eq('id', id).maybeSingle().then(({ data }) => {
      if (!cancelado) setCampoPrincipal((data as { name: string; address: string | null }) ?? null)
    })
    return () => { cancelado = true }
  }, [clubSettings?.home_field_id])

  const contagens: Record<string, string | undefined> = {
    Plantel: numeros ? `${numeros.atletas} ${numeros.atletas === 1 ? 'atleta' : 'atletas'}` : undefined,
    'Torneios e jornadas': numeros
      ? numeros.torneios === 0 ? 'nenhuma prova a decorrer' : `${numeros.torneios} a decorrer`
      : undefined,
  }

  return (
    <div className="relative">
      <CabecalhoEcra
        titulo="Clube"
        legenda={clubSettings?.name ?? CLUBE_NOME}
        className="mb-4"
      />

      {/* Os três números da época (ecrã 6a). */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {([
          ['Atletas', numeros?.atletas],
          ['Jogos', numeros?.jogos],
          ['Torneios', numeros?.torneios],
        ] as const).map(([etiqueta, valor]) => (
          <div key={etiqueta} className="cartao-simples p-3">
            <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/50 leading-tight">
              {etiqueta}
            </p>
            <p className="font-display font-black text-[22px] text-white mt-1 tabular-nums leading-none">
              {valor ?? '–'}
            </p>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <EtiquetaSeccao className="mb-2.5">Equipa</EtiquetaSeccao>
        <div className="space-y-2">
          {EQUIPA.map(entrada => (
            <LinhaEntrada key={entrada.titulo} entrada={entrada} contagem={contagens[entrada.titulo]} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Lock size={11} className="text-csc-gold" />
          <EtiquetaSeccao como="h2">Gestão</EtiquetaSeccao>
        </div>
        <div className="space-y-2">
          {gestaoVisivel.map(entrada => (
            <LinhaEntrada key={entrada.titulo} entrada={entrada} contagem={contagens[entrada.titulo]} />
          ))}
        </div>
      </section>

      {/* O campo de casa (ecrã 6a): onde se joga, com o caminho lá para. */}
      {campoPrincipal && (
        <section>
          <EtiquetaSeccao className="mb-2.5">Campo principal</EtiquetaSeccao>
          <CartaoSimples className="p-4 flex items-center gap-3.5">
            <MapPin size={20} className="shrink-0 text-csc-gold" />
            <span className="min-w-0 flex-1">
              <span className="block font-display font-extrabold text-sm text-white truncate">
                {campoPrincipal.name}
              </span>
              {campoPrincipal.address && (
                <span className="block text-[11px] leading-snug text-white/55 mt-0.5 truncate">
                  {campoPrincipal.address}
                </span>
              )}
            </span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                campoPrincipal.address ? `${campoPrincipal.name}, ${campoPrincipal.address}` : campoPrincipal.name,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic('light')}
              className="min-h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/15 text-csc-gold
                font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              Mapa
              <ExternalLink size={12} />
            </a>
          </CartaoSimples>
        </section>
      )}
    </div>
  )
}

export default ClubePage