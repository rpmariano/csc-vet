import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { haEntradaAnterior } from '../lib/rotas'
import {
  Landmark,
  CalendarPlus,
  Trophy,
  MapPin,
  Shield,
  Lock,
  Users,
  Swords,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { BotaoVoltar, CabecalhoEcra, EtiquetaSeccao, CartaoSimples } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { CLUBE_NOME } from '../lib/clube'
import { supabase } from '../lib/supabaseClient'
import { useSaidaGuardada } from '../context/SaidaGuardadaContext'
import { DadosDoClube } from '../components/clube/DadosDoClube'
import { GestaoCampos } from '../components/clube/GestaoCampos'
import { GestaoAdversarios } from '../components/clube/GestaoAdversarios'
import { GestaoTorneios } from '../components/clube/GestaoTorneios'
import { Relatorios } from '../components/clube/Relatorios'

/*
  As secções de gestão, cada uma um ecrã por direito. O `?ver=` no endereço é
  o que lhes dá link próprio e faz o retroceder do browser voltar ao índice —
  a mesma convenção da Competição e do Financeiro.
*/
const SECCOES = {
  dados: { titulo: 'Dados do clube', Componente: DadosDoClube },
  campos: { titulo: 'Campos', Componente: GestaoCampos },
  adversarios: { titulo: 'Adversários', Componente: GestaoAdversarios },
  torneios: { titulo: 'Torneios', Componente: GestaoTorneios },
  /* Só da direção: as dívidas de cada um, e (a seguir) os documentos. */
  relatorios: { titulo: 'Relatórios', sobrancelha: 'Direção', Componente: Relatorios, soDirecao: true },
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
  Competição é um lugar da barra, o Perfil abre na fotografia e os Comunicados
  no sino — que desde 2026-09-25 leva ao ecrã inteiro, onde também se publica.
  Sobra o que só tem esta porta: o Plantel, que saiu da barra para lhe dar o
  lugar.
*/
const EQUIPA: readonly Entrada[] = [
  {
    para: '/team-management',
    titulo: 'Plantel',
    descricao: 'Fichas, posições e estado dos atletas',
    Icone: Users,
  },
]

/*
  A gestão vive dentro deste ecrã, e não numa página à parte: é o que o
  handoff manda — "a página Admin desapareceu: tudo o que era gestão vive no
  ecrã Clube, num bloco marcado com 🔒".

  **Arrumada pelo que se vem cá fazer** (2026-09-25), e não num bloco só de
  seis linhas: o que se usa todas as semanas em cima (a época), o dinheiro e
  os dados pessoais num bloco da direção, e o que se configura uma vez e
  raramente se toca no fim. Estava tudo em "Gestão", por uma ordem que não
  dizia nada, com o Financeiro no fim da lista e os campos antes dos dados do
  clube.
*/
const EPOCA: readonly Entrada[] = [
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
]

/* O dinheiro e os dados pessoais — só a direção os vê. */
const DIRECAO: readonly Entrada[] = [
  {
    para: '/finance',
    titulo: 'Financeiro e quotas',
    descricao: 'Quotas, encargos, despesas e receitas',
    Icone: Landmark,
    soDirecao: true,
  },
  {
    para: '/clube?ver=relatorios',
    titulo: 'Relatórios',
    descricao: 'Contas por atleta, para partilhar no WhatsApp',
    Icone: ClipboardList,
    soDirecao: true,
  },
]

/* Configura-se uma vez e raramente se volta a tocar. */
const CONFIGURACAO: readonly Entrada[] = [
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
]

/** Um bloco do índice: a etiqueta (com cadeado, se for de gestão) e as linhas. */
const Bloco: React.FC<{
  titulo: string
  cadeado?: boolean
  entradas: readonly Entrada[]
  contagens: Record<string, string | undefined>
}> = ({ titulo, cadeado = false, entradas, contagens }) =>
  entradas.length === 0 ? null : (
    <section className="mb-6">
      <div className="flex items-center gap-1.5 mb-2.5">
        {cadeado && <Lock size={11} className="text-csc-gold" aria-hidden="true" />}
        <EtiquetaSeccao como="h2">{titulo}</EtiquetaSeccao>
      </div>
      <div className="space-y-2">
        {entradas.map(entrada => (
          <LinhaEntrada key={entrada.titulo} entrada={entrada} contagem={contagens[entrada.titulo]} />
        ))}
      </div>
    </section>
  )

const LinhaEntrada: React.FC<{ entrada: Entrada; contagem?: string }> = ({ entrada, contagem }) => (
  <CartaoSimples
    como={Link}
    to={entrada.para}
    /* Os destinos com rota própria (Plantel, Eventos, Financeiro) mostram
       "‹ Clube" por causa disto — ver `VoltarAOrigem`. */
    state={{ origem: 'Clube' }}
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
  </CartaoSimples>
)

const ClubePage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [params, setParams] = useSearchParams()
  const { pedirSaida } = useSaidaGuardada()
  const navegar = useNavigate()
  const eDirecao = profile?.role === 'admin'

  const chave = params.get('ver') as ChaveDeSeccao | null
  const candidata = chave && chave in SECCOES ? SECCOES[chave] : null
  // Uma secção da direção aberta por quem não é da direção cai no índice.
  const seccao = candidata && (!('soDirecao' in candidata) || eDirecao) ? candidata : null

  /* Voltar ao índice é o retroceder do browser, como nas fichas (ver
     `useVoltarDaFicha`): tirar o `?ver=` com um push deixava a secção no
     histórico, e o retroceder a seguir reabria-a. Aberta por um link, sem
     nada para trás, cai no índice. */
  const voltarAoIndice = () => {
    triggerHaptic('light')
    pedirSaida(() => {
      if (haEntradaAnterior()) navegar(-1)
      else setParams(new URLSearchParams(), { replace: true })
    })
  }

  const direcaoVisivel = DIRECAO.filter(e => !e.soDirecao || eDirecao)

  /*
    Os três números do topo (ecrã 6a): quantos somos, quantos jogos se
    fizeram, quantas provas estão a decorrer. São a primeira coisa do ecrã no
    handoff, e são também o que diz de relance se há alguma coisa por tratar.

    A contagem de atletas vem de `v_players_public` e não de `profiles`: é
    plantel, e a vista é a que qualquer autenticado pode ler.
  */
  const [numeros, setNumeros] = useState<{ atletas: number; jogos: number; torneios: number } | null>(null)
  const [campoDeCasa, setCampoDeCasa] = useState<string | null>(null)

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
      setCampoDeCasa(null)
      return
    }
    supabase.from('fields').select('name, address').eq('id', id).maybeSingle().then(({ data }) => {
      if (!cancelado) setCampoDeCasa((data as { name: string } | null)?.name ?? null)
    })
    return () => { cancelado = true }
  }, [clubSettings?.home_field_id])

  const contagens: Record<string, string | undefined> = {
    Plantel: numeros ? `${numeros.atletas} ${numeros.atletas === 1 ? 'atleta' : 'atletas'}` : undefined,
    /* O campo de casa era um cartão no fim do índice, que repetia o que os
       Dados do clube já dizem; fica dito aqui, na linha dos campos. */
    Campos: campoDeCasa ? `Campo de casa: ${campoDeCasa}` : undefined,
    'Torneios e jornadas': numeros
      ? numeros.torneios === 0 ? 'nenhuma prova a decorrer' : `${numeros.torneios} a decorrer`
      : undefined,
  }

  if (seccao) {
    return (
      <div className="relative">
        <BotaoVoltar para="Clube" aoVoltar={voltarAoIndice} />
        {/* A sobrancelha só onde diz alguma coisa: "Clube" repetia o "‹ Clube"
            logo por cima; "Direção" diz de quem é a secção. */}
        <CabecalhoEcra
          titulo={seccao.titulo}
          sobrancelha={'sobrancelha' in seccao ? seccao.sobrancelha : undefined}
          className="mb-4"
        />
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

      <Bloco titulo="Equipa" entradas={EQUIPA} contagens={contagens} />

      <Bloco titulo="Época" cadeado entradas={EPOCA} contagens={contagens} />
      <Bloco titulo="Direção" cadeado entradas={direcaoVisivel} contagens={contagens} />
      <Bloco titulo="Configuração" cadeado entradas={CONFIGURACAO} contagens={contagens} />
    </div>
  )
}

export default ClubePage