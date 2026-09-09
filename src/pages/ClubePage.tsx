import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Landmark,
  Megaphone,
  CalendarPlus,
  Trophy,
  MapPin,
  Shield,
  Lock,
  Users,
  Swords,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { CabecalhoEcra, EtiquetaSeccao, CartaoSimples } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { CLUBE_NOME } from '../lib/clube'
import { supabase } from '../lib/supabaseClient'
import { useSaidaGuardada } from '../context/SaidaGuardadaContext'
import { DadosDoClube } from '../components/clube/DadosDoClube'
import { GestaoCampos } from '../components/clube/GestaoCampos'
import { GestaoAdversarios } from '../components/clube/GestaoAdversarios'
import { GestaoTorneios } from '../components/clube/GestaoTorneios'

/*
  As secções de gestão, cada uma um ecrã por direito. O `?ver=` no endereço é
  o que lhes dá link próprio e faz o retroceder do browser voltar ao índice —
  a mesma convenção da Competição e do Financeiro.
*/
const SECCOES = {
  dados: { titulo: 'Dados do clube', sobrancelha: 'Clube', Componente: DadosDoClube },
  campos: { titulo: 'Campos', sobrancelha: 'Clube', Componente: GestaoCampos },
  adversarios: { titulo: 'Adversários', sobrancelha: 'Clube', Componente: GestaoAdversarios },
  torneios: { titulo: 'Torneios', sobrancelha: 'Clube', Componente: GestaoTorneios },
} as const

type ChaveDeSeccao = keyof typeof SECCOES

/**
 * Clube — o quarto lugar da barra de quem gere.
 *
 * Substitui o Backoffice como porta de entrada. A diferença não é de nome: o
 * Backoffice era um sítio à parte, com a sua própria navegação lá dentro;
 * o Clube é uma lista de destinos, e o que é de gestão fica num bloco à
 * parte, marcado com 🔒, para se perceber de relance o que é consulta e o
 * que mexe na vida do clube.
 *
 * O ecrã é as duas coisas: o índice, e as quatro secções de gestão que o
 * `?ver=` abre por cima dele — dados do clube, campos, adversários e
 * torneios. O backoffice era uma página com separadores, e o Clube limitava-se
 * a ligar-lhe: três das suas linhas caíam todas lá, e os campos não tinham
 * porta nenhuma.
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

/*
  O que a barra de baixo e o canto do cabeçalho já dão não se repete aqui: a
  Competição é um lugar da barra e o Perfil abre na fotografia. Sobra o que só
  tem esta porta — o Plantel, que saiu da barra para lhe dar o lugar, e os
  Comunicados, cujo sino do cabeçalho só serve para ler.
*/
const EQUIPA: readonly Entrada[] = [
  {
    para: '/team-management',
    titulo: 'Plantel',
    descricao: 'Fichas, posições e estado dos atletas',
    Icone: Users,
  },
  {
    para: '/announcements',
    titulo: 'Comunicados',
    descricao: 'Publicar e editar os avisos à equipa',
    Icone: Megaphone,
  },
]

/*
  A gestão vive dentro deste ecrã, e não numa página à parte: é o que o
  handoff manda — "a página Admin desapareceu: tudo o que era gestão vive no
  ecrã Clube, num bloco marcado com 🔒". Enquanto o backoffice existiu como
  página, três destas linhas caíam todas nela, em separadores diferentes, e os
  campos não tinham porta nenhuma.
*/
const GESTAO: readonly Entrada[] = [
  {
    para: '/events',
    titulo: 'Eventos e convocatórias',
    descricao: 'Criar jogos, treinos e convívios; convocar',
    Icone: CalendarPlus,
  },
  {
    para: '/clube?ver=torneios',
    titulo: 'Torneios e jornadas',
    descricao: 'Competições, grupos, equipas e jogos',
    Icone: Trophy,
  },
  {
    para: '/clube?ver=adversarios',
    titulo: 'Adversários',
    descricao: 'Os clubes que defrontamos, com contactos',
    Icone: Swords,
  },
  {
    para: '/clube?ver=campos',
    titulo: 'Campos',
    descricao: 'Onde se joga e onde se treina',
    Icone: MapPin,
  },
  {
    para: '/clube?ver=dados',
    titulo: 'Dados do clube',
    descricao: 'Nome, sigla, emblema e campo de casa',
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
      <span className="block text-[11px] leading-snug text-white/62 mt-0.5">
        {contagem ?? entrada.descricao}
      </span>
    </span>
    <ChevronRight size={16} className="shrink-0 text-white/35" />
  </CartaoSimples>
)

const ClubePage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [params, setParams] = useSearchParams()
  const { pedirSaida } = useSaidaGuardada()
  const eDirecao = profile?.role === 'admin'

  const chave = params.get('ver') as ChaveDeSeccao | null
  const seccao = chave && chave in SECCOES ? SECCOES[chave] : null

  /* Voltar ao índice limpa a secção e o que ela tenha aberto por endereço. */
  const voltarAoIndice = () => {
    triggerHaptic('light')
    pedirSaida(() => setParams(new URLSearchParams()))
  }

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

  if (seccao) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={voltarAoIndice}
          className="min-h-11 -ml-1 pr-3 flex items-center gap-1 text-csc-gold font-display font-extrabold text-[11px] cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          <ChevronLeft size={16} />
          <span>Clube</span>
        </button>
        <CabecalhoEcra titulo={seccao.titulo} className="mb-4" />
        <seccao.Componente />
      </div>
    )
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
            <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62 leading-tight">
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
                <span className="block text-[11px] leading-snug text-white/62 mt-0.5 truncate">
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