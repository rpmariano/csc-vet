import React, { useEffect, useRef, useState } from 'react'
import { X, Award, Footprints, Save, CheckCircle2, Lock, Users, Pencil, Clock, AlertTriangle } from 'lucide-react'
import { sincronizarJogoNaJornada, AVISO_SEM_EQUIPAS } from '../lib/jornadaDoJogo'
import { supabase } from '../lib/supabaseClient'
import { formatClubSigla, formatOpponentSigla } from '../lib/siglas'
import { toast } from '../context/ToastContext'
import { VistaDetalhe } from './VistaDetalhe'
import { Modal } from './Modal'
import { CLUBE_SIGLA } from '../lib/clube'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { ConfirmModal } from './ConfirmModal'

interface MatchReportModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  event: any
  isCoachOrAdmin: boolean
  onSaved?: () => void
  tournamentRules?: any
}

interface PlayerMatchStat {
  player_id: string
  name: string
  jersey_number?: number | null
  shirt_name?: string | null
  photo_url?: string | null
  position?: string | null
  lineup_status: 'starter' | 'sub' | 'none'
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_mvp: boolean
}

const TACTICAL_FORMATIONS = [
  '4-3-3',
  '4-4-2',
  '3-5-2',
  '4-2-3-1',
  '3-4-3',
  '4-1-4-1',
  '5-3-2',
  '2-3-1 (Fut 7)',
  '3-2-1 (Fut 7)',
  '3-1-2 (Fut 7)',
  '2-2-2 (Fut 7)',
  'Personalizado'
]

export const parseMatchReportMetadata = (desc?: string | null) => {
  if (!desc) return { tacticalFormation: '4-3-3', occurrences: '', cleanDescription: '' }
  
  const reportTagMatch = desc.match(/\[MATCH_REPORT:([\s\S]*?)\]/)
  if (reportTagMatch && reportTagMatch[1]) {
    try {
      const parsed = JSON.parse(reportTagMatch[1])
      const cleanDescription = desc.replace(/\[MATCH_REPORT:[\s\S]*?\]/, '').trim()
      const rawFormation = parsed.tactical || '4-3-3'
      return {
        tacticalFormation: rawFormation.replace(/^1-/, ''),
        occurrences: parsed.occurrences || '',
        cleanDescription
      }
    } catch {
      // Fallback
    }
  }

  return { tacticalFormation: '4-3-3', occurrences: '', cleanDescription: desc || '' }
}

export const buildDescriptionWithMatchReport = (
  cleanDesc: string,
  tacticalFormation: string,
  occurrences: string
) => {
  const metaObj = {
    tactical: tacticalFormation,
    occurrences: occurrences.trim()
  }
  const metaString = `[MATCH_REPORT:${JSON.stringify(metaObj)}]`
  return `${cleanDesc.trim()}\n\n${metaString}`.trim()
}

export const MatchReportModal: React.FC<MatchReportModalProps> = ({
  isOpen,
  onClose,
  eventId,
  event,
  isCoachOrAdmin,
  onSaved,
  tournamentRules
}) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Scores
  /* Aberto quando o resultado tem golos que nenhum atleta marcou: pergunta-se
     antes de gravar, porque pode ser um autogolo do adversário. */
  const [golosSemMarcador, setGolosSemMarcador] = useState(false)
  const [homeScore, setHomeScore] = useState<number | null>(event?.home_score ?? null)
  const [awayScore, setAwayScore] = useState<number | null>(event?.away_score ?? null)

  // Tactical & Notes
  const [tacticalFormation, setTacticalFormation] = useState('4-3-3')
  const [occurrences, setOccurrences] = useState('')
  const [cleanDescription, setCleanDescription] = useState('')

  // Players
  const [playerStats, setPlayerStats] = useState<PlayerMatchStat[]>([])

  useEffect(() => {
    if (!isOpen || !eventId) return

    const loadData = async () => {
      setLoading(true)
      try {
        // 1. Parse Event description
        const parsed = parseMatchReportMetadata(event?.description)
        setTacticalFormation(parsed.tacticalFormation)
        setOccurrences(parsed.occurrences)
        setCleanDescription(parsed.cleanDescription)
        setHomeScore(event?.home_score ?? null)
        setAwayScore(event?.away_score ?? null)

        // Se coach/admin, sem resultado ainda, e o jogo já se realizou, entra logo em modo de edição.
        // Jogos futuros nunca entram em modo de edição — ainda não há nada para reportar.
        const temResultadoAlready = event?.home_score !== null && event?.home_score !== undefined
        const alreadyPlayed = !event?.date_time || new Date(event.date_time).getTime() <= Date.now()
        if (isCoachOrAdmin && !temResultadoAlready && alreadyPlayed) {
          setIsEditModalOpen(true)
        } else {
          setIsEditModalOpen(false)
        }

        // 2. Fetch all profiles & callups for this event
        const [{ data: profilesData }, { data: callupsData }, { data: statsData }] = await Promise.all([
          supabase.from('v_players_public').select('id, name, shirt_name, jersey_number, photo_url, position, role, roles').order('jersey_number', { ascending: true, nullsFirst: false }),
          supabase.from('callups').select('player_id, status, notes').eq('event_id', eventId),
          supabase.from('stats').select('*').eq('event_id', eventId)
        ])

        const callupMap = new Map((callupsData || []).map(c => [c.player_id, c]))
        const statMap = new Map((statsData || []).map(s => [s.player_id, s]))

        const allProfiles = profilesData || []
        const relevantProfiles = allProfiles.filter(p => {
          if (callupMap.has(p.id)) return true
          if (statMap.has(p.id)) return true
          return false
        })

        const candidateProfiles = relevantProfiles.length > 0 ? relevantProfiles : allProfiles.filter(p => p.role === 'player')

        const merged: PlayerMatchStat[] = candidateProfiles.map(p => {
          const stat = statMap.get(p.id)
          const callup = callupMap.get(p.id)
          
          let lineup_status: 'starter' | 'sub' | 'none' = 'none'
          if (callup?.notes?.includes('lineup:starter') || callup?.notes?.includes('starter') || stat?.is_starter) {
            lineup_status = 'starter'
          } else if (callup?.notes?.includes('lineup:sub') || callup?.notes?.includes('sub') || (stat && (stat.goals > 0 || stat.assists > 0 || stat.yellow_cards > 0 || stat.red_cards > 0))) {
            lineup_status = 'sub'
          } else if (callup?.status === 'confirmed') {
            lineup_status = 'starter'
          }

          return {
            player_id: p.id,
            name: p.name,
            jersey_number: p.jersey_number,
            shirt_name: p.shirt_name,
            photo_url: p.photo_url,
            position: p.position,
            lineup_status,
            goals: stat?.goals || 0,
            assists: stat?.assists || 0,
            yellow_cards: stat?.yellow_cards || 0,
            red_cards: stat?.red_cards || 0,
            is_mvp: !!stat?.is_mvp
          }
        })

        merged.sort((a, b) => {
          const order = { starter: 1, sub: 2, none: 3 }
          if (order[a.lineup_status] !== order[b.lineup_status]) {
            return order[a.lineup_status] - order[b.lineup_status]
          }
          return (a.jersey_number || 99) - (b.jersey_number || 99)
        })

        setPlayerStats(merged)
      } catch (err) {
        console.error('Error loading match report:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen, eventId, event, isCoachOrAdmin])

  const handleStatChange = (playerId: string, field: keyof PlayerMatchStat, value: any) => {
    setPlayerStats(prev => prev.map(p => {
      if (p.player_id !== playerId) return p
      return { ...p, [field]: value }
    }))
  }

  // Nunca mais de MAX_STARTERS titulares em simultâneo — onze é o máximo de um jogo de futebol.
  const MAX_STARTERS_LIMIT = 11

  const handleSetStarter = (playerId: string) => {
    setPlayerStats(prev => {
      const target = prev.find(p => p.player_id === playerId)
      if (!target || target.lineup_status === 'starter') return prev
      const currentStarters = prev.filter(p => p.lineup_status === 'starter').length
      if (currentStarters >= MAX_STARTERS_LIMIT) {
        toast.warning(`Já tens ${MAX_STARTERS_LIMIT} titulares selecionados. Passa outro atleta a suplente antes de adicionar este.`)
        return prev
      }
      return prev.map(p => p.player_id === playerId ? { ...p, lineup_status: 'starter' } : p)
    })
  }

  // Ao marcar golo/assistência a um atleta ainda "Não Jogou", promove-o automaticamente —
  // mas só a titular se ainda houver vaga, caso contrário entra como suplente.
  const handlePromoteIfNone = (playerId: string) => {
    setPlayerStats(prev => {
      const target = prev.find(p => p.player_id === playerId)
      if (!target || target.lineup_status !== 'none') return prev
      const currentStarters = prev.filter(p => p.lineup_status === 'starter').length
      const newStatus: 'starter' | 'sub' = currentStarters < MAX_STARTERS_LIMIT ? 'starter' : 'sub'
      return prev.map(p => p.player_id === playerId ? { ...p, lineup_status: newStatus } : p)
    })
  }

  const handleToggleMvp = (playerId: string) => {
    setPlayerStats(prev => prev.map(p => ({
      ...p,
      is_mvp: p.player_id === playerId ? !p.is_mvp : false
    })))
  }

  /*
    Os golos dos atletas contra o resultado.

    **Somar mais golos do que o resultado é impossível**, e a ficha deixava
    gravar: um jogo 2-1 com quatro golos repartidos pelos jogadores ficava na
    base a alimentar as estatísticas e a classificação. Faltar é outra coisa —
    um autogolo do adversário conta para nós e não tem marcador —, por isso
    esse caso pergunta em vez de recusar.

    `home_score` é o da casa do jogo, não o nosso: fora, os nossos golos são os
    da visita. É assim que a app inteira lê o placar.
  */
  const nossosGolos = event?.home_away === 'away' ? awayScore : homeScore
  const golosDosAtletas = playerStats.reduce((soma, p) => soma + p.goals, 0)
  const golosAMais = nossosGolos !== null && nossosGolos !== undefined
    ? golosDosAtletas - nossosGolos
    : 0
  const semResultado = (nossosGolos === null || nossosGolos === undefined) && golosDosAtletas > 0

  const handleSaveReport = async (confirmado = false) => {
    if (!isCoachOrAdmin) return

    if (semResultado) {
      toast.warning(
        `Os atletas somam ${golosDosAtletas} ${golosDosAtletas === 1 ? 'golo' : 'golos'},` +
        ' mas o resultado está por preencher.',
      )
      return
    }
    if (golosAMais > 0) {
      toast.error(
        `Os atletas somam ${golosDosAtletas} golos e o resultado dá ${nossosGolos} ao ${CLUBE_SIGLA}.` +
        ' Corrige um dos dois antes de gravar.',
      )
      return
    }
    if (golosAMais < 0 && !confirmado) {
      setGolosSemMarcador(true)
      return
    }
    setGolosSemMarcador(false)

    setSaving(true)
    setSaveSuccess(false)
    try {
      const updatedDescription = buildDescriptionWithMatchReport(
        cleanDescription,
        tacticalFormation,
        occurrences
      )

      await supabase
        .from('events')
        .update({
          home_score: homeScore,
          away_score: awayScore,
          description: updatedDescription
        })
        .eq('id', eventId)

      /*
        E o resultado entra na tabela da prova sozinho: a linha da jornada é o
        espelho deste jogo, pela jornada que se escolheu ao criá-lo. Era este
        o passo que faltava — quem lançava a ficha tinha de ir à Classificação
        escrever o mesmo resultado outra vez à mão.
      */
      const espelho = await sincronizarJogoNaJornada({
        ...event,
        id: eventId,
        home_score: homeScore,
        away_score: awayScore,
      })
      if (espelho.estado === 'sem-equipas') toast.warning(AVISO_SEM_EQUIPAS)

      const participatingPlayers = playerStats.filter(p => p.lineup_status !== 'none' || p.goals > 0 || p.yellow_cards > 0 || p.red_cards > 0)
      
      const newSuspensions = []

      for (const p of participatingPlayers) {
        const payload: any = {
          event_id: eventId,
          player_id: p.player_id,
          goals: p.goals,
          assists: p.assists,
          yellow_cards: p.yellow_cards,
          red_cards: p.red_cards,
          is_mvp: p.is_mvp
        }

        await supabase
          .from('stats')
          .upsert(payload, { onConflict: 'event_id,player_id' })

        await supabase
          .from('callups')
          .update({ notes: `lineup:${p.lineup_status}` })
          .eq('event_id', eventId)
          .eq('player_id', p.player_id)

        // Verificação de Castigos / Suspensões se este evento pertence a um torneio
        if (event?.tournament_id && tournamentRules?.yellow_cards_to_suspension && p.yellow_cards > 0) {
          // Precisamos buscar todos os cartões amarelos deste jogador neste torneio
          const { data: pastStats } = await supabase
            .from('stats')
            .select('yellow_cards, event:events!inner(tournament_id)')
            .eq('player_id', p.player_id)
            .eq('events.tournament_id', event.tournament_id)
          
          let totalYellows = p.yellow_cards
          if (pastStats) {
            totalYellows = pastStats.reduce((acc, st) => acc + (st.yellow_cards || 0), 0)
          }

          // Nota: Ao ler os stats acabámos de gravar o atual, portanto o current já lá pode estar incluído se o select os apanhou, 
          // mas o UPSERT pode ter acontecido, então é mais seguro ler tudo incluindo o atual depois do UPSERT e somar.
          // Na verdade, se pastStats traz a soma de TUDO, totalYellows = soma.
          totalYellows = pastStats ? pastStats.reduce((acc, st) => acc + (st.yellow_cards || 0), 0) : p.yellow_cards

          if (totalYellows > 0 && totalYellows % tournamentRules.yellow_cards_to_suspension === 0) {
            newSuspensions.push(p.name)
            await supabase.from('tournament_suspensions').insert([{
              tournament_id: event.tournament_id,
              player_id: p.player_id,
              reason: `Acumulação de Amarelos (${totalYellows})`,
              status: 'active'
            }])
          }
        }
      }

      if (newSuspensions.length > 0) {
        const names = newSuspensions.join(', ')
        // Mostraremos um alerta na UI ou apenas toast
        localStorage.setItem(`csc_suspension_alert_${event.tournament_id}`, `Os seguintes jogadores atingiram o limite de amarelos e estão suspensos no próximo jogo: ${names}`)
      }

      const nonParticipants = playerStats.filter(p => p.lineup_status === 'none' && p.goals === 0 && p.yellow_cards === 0 && p.red_cards === 0)
      for (const p of nonParticipants) {
        await supabase
          .from('stats')
          .delete()
          .eq('event_id', eventId)
          .eq('player_id', p.player_id)
      }

      setSaveSuccess(true)
      setIsEditModalOpen(false)
      if (onSaved) onSaved()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving match report:', err)
      toast.error('Erro ao guardar a ficha de jogo. Por favor tenta novamente.')
    } finally {
      setSaving(false)
    }
  }

  /*
    Um jogo ainda não realizado (e sem resultado registado) não tem ficha para
    mostrar ou editar. Calculado aqui em cima, antes do `return null`, porque o
    guarda de alterações precisa de o saber e um hook não corre depois de uma
    saída antecipada.
  */
  const temResultado = event?.home_score !== null && event?.home_score !== undefined
  const jogoPorRealizar = !temResultado && !!event?.date_time && new Date(event.date_time).getTime() > Date.now()

  /*
    A fotografia da ficha ao entrar em edição. Serve duas coisas: o guarda de
    alterações compara com ela, e o "Cancelar" repõe-na — antes fechava o
    diálogo e deixava os valores alterados no estado, por isso cancelar uma
    edição não cancelava nada, e a alteração ia à vida na gravação seguinte.
  */
  const fichaAoEditar = useRef<{
    homeScore: number | null
    awayScore: number | null
    tacticalFormation: string
    occurrences: string
    playerStats: PlayerMatchStat[]
  } | null>(null)

  useEffect(() => {
    if (isEditModalOpen && !loading) {
      if (!fichaAoEditar.current) {
        fichaAoEditar.current = { homeScore, awayScore, tacticalFormation, occurrences, playerStats }
      }
    } else if (!isEditModalOpen) {
      fichaAoEditar.current = null
    }
  }, [isEditModalOpen, loading, homeScore, awayScore, tacticalFormation, occurrences, playerStats])

  const guardaFicha = useAlteracoesPorGravar({
    aberto: isEditModalOpen && !jogoPorRealizar,
    // A ficha vem da rede depois de o diálogo abrir; sem isto o próprio
    // carregamento contava como alteração do utilizador.
    pronto: !loading,
    valores: [homeScore, awayScore, tacticalFormation, occurrences, playerStats],
    aoGravar: () => handleSaveReport(),
    aoSair: () => {
      const antes = fichaAoEditar.current
      if (antes) {
        setHomeScore(antes.homeScore)
        setAwayScore(antes.awayScore)
        setTacticalFormation(antes.tacticalFormation)
        setOccurrences(antes.occurrences)
        setPlayerStats(antes.playerStats)
      }
      setIsEditModalOpen(false)
    },
    descricao: 'O resultado, os marcadores e as ocorrências ainda não foram gravados. Se saíres agora, perdem-se.',
  })

  if (!isOpen) return null

  const isAway = event?.home_away === 'away'
  const cscSigla = formatClubSigla()
  const oppSigla = formatOpponentSigla(event?.opponent)
  const leftSigla = isAway ? oppSigla : cscSigla
  const rightSigla = isAway ? cscSigla : oppSigla
  const leftName = isAway ? (event?.opponent?.name || 'Adversário') : CLUBE_SIGLA
  const rightName = isAway ? CLUBE_SIGLA : (event?.opponent?.name || 'Adversário')

  const starters = playerStats.filter(p => p.lineup_status === 'starter')
  const subs = playerStats.filter(p => p.lineup_status === 'sub')

  const totalGoals = playerStats.reduce((sum, p) => sum + p.goals, 0)
  const totalYellows = playerStats.reduce((sum, p) => sum + p.yellow_cards, 0)
  const totalReds = playerStats.reduce((sum, p) => sum + p.red_cards, 0)


  return (
    <>
    <VistaDetalhe
      isOpen={isOpen}
      onClose={onClose}
      tone="dark"
      size="3xl"
      showCloseButton={false}
      ariaLabel={`Ficha de jogo: ${leftSigla} vs ${rightSigla}`}
      voltarTexto="Voltar"
      className="border-2 border-csc-gold/60"
    >
      <div className="space-y-5">

        {/* Fechar a ficha. */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer z-20 transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          title="Fechar"
        >
          <X size={19} className="stroke-[2.5]" />
        </button>

        {/*
          Cabeçalho da ficha (ecrã 2a): a sobrancelha dourada diz o que isto é,
          a prova em baixo diz de que jogo se trata, e o confronto é o título.

          Estava tudo em pastilhas na mesma linha — "Ficha Oficial de Jogo",
          "Amigável", o nome do torneio — três etiquetas a competir pela mesma
          atenção. Só uma delas é o assunto.
        */}
        <div className="pb-3 border-b border-white/10 pr-12 space-y-2">
          <div>
            <p className="font-display font-extrabold text-[9px] tracking-[0.16em] uppercase text-csc-gold">
              Ficha oficial de jogo
            </p>
            <p className="text-[11px] text-white/62 mt-0.5">
              {event?.tournament?.name ?? (event?.is_friendly ? 'Jogo amigável' : 'Sem prova associada')}
            </p>
          </div>

          <h2 className="font-display font-black text-[26px] leading-none text-white tracking-[-0.02em]">
            {leftSigla} <span className="text-white/35">vs</span> {rightSigla}
          </h2>

          <p className="text-[11px] text-white/62">
            {event?.date_time && new Date(event.date_time).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>

          {isCoachOrAdmin && !jogoPorRealizar && !loading && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="w-full min-h-12 mt-1 px-5 rounded-3xl bg-csc-gold text-csc-tinta border border-csc-gold
                font-display font-extrabold text-[12.5px] flex items-center justify-center gap-2 cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Pencil size={14} />
              <span>Editar ficha de jogo</span>
            </button>
          )}
        </div>

        {saveSuccess && (
          <div className="p-3 bg-csc-light/12 border border-csc-light/30 rounded-2xl text-csc-verde-texto text-xs font-black flex items-center gap-2">
            <CheckCircle2 size={18} className="text-csc-light shrink-0" />
            <span>Ficha de jogo e estatísticas atualizadas com sucesso!</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-9 w-9 border-t-2 border-b-2 border-csc-gold mb-2"></div>
            <p className="text-xs font-bold text-white/70">A carregar dados do jogo...</p>
          </div>
        ) : jogoPorRealizar ? (
          <div className="p-6 sm:p-8 bg-white/5 border border-white/10 rounded-3xl text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/10 text-csc-gold flex items-center justify-center mx-auto">
              <Clock size={22} />
            </div>
            <h3 className="text-sm font-black text-white">Este jogo ainda não se realizou</h3>
            <p className="text-xs text-white/70 max-w-sm mx-auto leading-relaxed">
              A ficha oficial — resultado, esquema tático, golos, cartões e MVP — fica disponível
              para consulta e preenchimento depois do apito inicial.
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* 1. SCOREBOARD & RESULTADO */}
            <div className="bg-gradient-to-br from-csc-dark via-emerald-950 to-csc-dark text-white rounded-3xl p-5 sm:p-6 shadow-md border-2 border-csc-gold/80 relative overflow-hidden">
              <div className="grid grid-cols-11 items-center gap-3 text-center">
                
                {/* Equipa 1 */}
                <div className="col-span-4 flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-2xl bg-white p-1.5 border border-white/30 flex items-center justify-center shrink-0">
                    {isAway ? (
                      event?.opponent?.logo_url ? (
                        <img src={event.opponent.logo_url} alt={leftSigla} className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-black text-csc-dark text-sm">{leftSigla}</span>
                      )
                    ) : (
                      <img src="/csc-vet/cascais-emblem.png" alt="CSC" className="w-full h-full object-contain" />
                    )}
                  </div>
                  <span className="text-base sm:text-lg font-black uppercase text-white tracking-wide">{leftSigla}</span>
                  <span className="text-[11px] text-white/30 truncate max-w-[120px] sm:max-w-[150px]">{leftName}</span>
                </div>

                {/* Placar Central */}
                <div className="col-span-3 flex flex-col items-center justify-center gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-white px-3 py-1 bg-black/40 rounded-2xl border border-white/20">
                      {homeScore !== null && homeScore !== undefined ? homeScore : '-'}
                    </span>
                    <span className="text-2xl font-black text-csc-gold">:</span>
                    <span className="text-3xl sm:text-4xl font-black text-white px-3 py-1 bg-black/40 rounded-2xl border border-white/20">
                      {awayScore !== null && awayScore !== undefined ? awayScore : '-'}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-200">
                    {homeScore !== null ? 'Resultado Final' : 'Sem Resultado'}
                  </span>
                </div>

                {/* Equipa 2 */}
                <div className="col-span-4 flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-2xl bg-white p-1.5 border border-white/30 flex items-center justify-center shrink-0">
                    {!isAway ? (
                      event?.opponent?.logo_url ? (
                        <img src={event.opponent.logo_url} alt={rightSigla} className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-black text-csc-dark text-sm">{rightSigla}</span>
                      )
                    ) : (
                      <img src="/csc-vet/cascais-emblem.png" alt="CSC" className="w-full h-full object-contain" />
                    )}
                  </div>
                  <span className="text-base sm:text-lg font-black uppercase text-white tracking-wide">{rightSigla}</span>
                  <span className="text-[11px] text-white/30 truncate max-w-[120px] sm:max-w-[150px]">{rightName}</span>
                </div>

              </div>
            </div>

            {/*
              Tático, golos e disciplina (ecrã 2a): três mosaicos numa fila,
              não três cartões empilhados. Estavam com `sm:grid-cols-3`, e os
              pontos de corte do Tailwind estão desligados nesta app — o que
              quer dizer que eram sempre uma coluna só.
            */}
            <div className="grid grid-cols-3 gap-2">
              <div className="cartao-simples p-3">
                <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62 leading-tight">
                  Tático
                </p>
                <p className="font-display font-black text-[17px] text-white mt-1 tabular-nums leading-none">
                  {(tacticalFormation || '4-3-3').replace(/^1-/, '')}
                </p>
              </div>

              <div className="cartao-simples p-3">
                <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62 leading-tight">
                  Golos
                </p>
                <p className="font-display font-black text-[17px] text-csc-gold mt-1 tabular-nums leading-none">
                  {totalGoals}
                </p>
              </div>

              <div className="cartao-simples p-3">
                <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62 leading-tight">
                  Disciplina
                </p>
                <p className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 font-display font-black text-[15px] text-csc-gold tabular-nums leading-none">
                    <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-gold" aria-hidden="true" />
                    <span className="sr-only">Cartões amarelos:</span>
                    {totalYellows}
                  </span>
                  <span className="flex items-center gap-1 font-display font-black text-[15px] text-csc-vermelho-texto tabular-nums leading-none">
                    <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-red" aria-hidden="true" />
                    <span className="sr-only">Cartões vermelhos:</span>
                    {totalReds}
                  </span>
                </p>
              </div>
            </div>

            {/* 3. PLANTEL: 11 INICIAL / TITULARES & SUPLENTES */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Users size={18} className="text-csc-gold" />
                  <span>Desempenho dos Atletas ({playerStats.filter(p => p.lineup_status !== 'none').length} Jogadores)</span>
                </h3>
              </div>

              <div className="space-y-4">
                  {/* Titulares */}
                  <div className="bg-white/[0.07] rounded-2xl border border-white/10 border-t-white/20 overflow-hidden shadow-lg shadow-black/20">
                    <div className="bg-emerald-800 text-white px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-between">
                      <span>Titulares ({starters.length})</span>
                      <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-700">{(tacticalFormation || '4-3-3').replace(/^1-/, '')}</span>
                    </div>
                    {starters.length === 0 ? (
                      <p className="p-4 text-xs text-white/70 font-semibold italic text-center">Nenhum titular registado.</p>
                    ) : (
                      <div className="p-2.5 space-y-2">
                        {starters.map(p => {
                          const displayName = p.shirt_name || p.name
                          return (
                          <div key={p.player_id} className="px-3 py-2.5 flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 text-sm font-black flex items-center justify-center shrink-0 shadow-xs">
                                {p.jersey_number || '—'}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-black text-white truncate flex items-center gap-1.5">
                                  <span>{displayName}</span>
                                  {p.is_mvp && (
                                    <span className="text-[10px] font-black bg-csc-gold/15 text-csc-gold px-1.5 py-0.5 rounded border border-csc-gold/35 flex items-center gap-0.5">
                                      <Award size={10} className="text-csc-gold" /> MVP
                                    </span>
                                  )}
                                </p>
                                {p.position && (
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {p.position.split(',').map((pos: string, idx: number) => (
                                      <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-csc-blue/20 text-csc-azul-texto">{pos.trim()}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Estatísticas do Atleta */}
                            <div className="flex items-center gap-2 shrink-0 text-xs font-black">
                              {p.goals > 0 && (
                                <span className="px-2 py-0.5 bg-csc-gold/15 text-csc-gold rounded-lg border border-csc-gold/35 flex items-center gap-1">
                                  {p.goals} {p.goals > 1 ? 'golos' : 'golo'}
                                </span>
                              )}
                              {p.assists > 0 && (
                                <span className="px-2 py-0.5 bg-csc-blue/12 text-csc-azul-texto rounded-lg border border-csc-blue/30 flex items-center gap-1">
                                  <Footprints size={12} className="text-csc-azul-texto" /> {p.assists} ass
                                </span>
                              )}
                              {p.yellow_cards > 0 && (
                                <span className="px-2 py-0.5 bg-csc-gold/15 text-csc-gold rounded-lg border border-csc-gold/35 flex items-center gap-1">
                                  <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-gold" aria-hidden="true" /><span className="sr-only">Cartões amarelos:</span>{p.yellow_cards}
                                </span>
                              )}
                              {p.red_cards > 0 && (
                                <span className="px-2 py-0.5 bg-csc-red/15 text-csc-vermelho-texto rounded-lg border border-csc-red/35 flex items-center gap-1">
                                  <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-red" aria-hidden="true" /><span className="sr-only">Cartão vermelho</span>
                                </span>
                              )}
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>

                  {/* Suplentes Utilizados */}
                  {subs.length > 0 && (
                    <div className="bg-white/[0.07] rounded-2xl border border-white/10 border-t-white/20 overflow-hidden shadow-lg shadow-black/20">
                      <div className="bg-blue-900 text-white px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <span>Suplentes utilizados ({subs.length})</span>
                      </div>
                      <div className="p-2.5 space-y-2">
                        {subs.map(p => {
                          const displayName = p.shirt_name || p.name
                          return (
                          <div key={p.player_id} className="px-3 py-2.5 flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 text-sm font-black flex items-center justify-center shrink-0 shadow-xs">
                                {p.jersey_number || '—'}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-black text-white truncate">
                                  {displayName}
                                </p>
                                {p.position && (
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {p.position.split(',').map((pos: string, idx: number) => (
                                      <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-csc-blue/20 text-csc-azul-texto">{pos.trim()}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-xs font-black">
                              {p.goals > 0 && (
                                <span className="px-2 py-0.5 bg-csc-gold/15 text-csc-gold rounded-lg border border-csc-gold/35 flex items-center gap-1">
                                  {p.goals}
                                </span>
                              )}
                              {p.assists > 0 && (
                                <span className="px-2 py-0.5 bg-csc-blue/12 text-csc-azul-texto rounded-lg border border-csc-blue/30 flex items-center gap-1">
                                  <Footprints size={12} className="text-csc-azul-texto" /> {p.assists} ass
                                </span>
                              )}
                              {p.yellow_cards > 0 && (
                                <span className="px-2 py-0.5 bg-csc-gold/15 text-csc-gold rounded-lg border border-csc-gold/35 flex items-center gap-1">
                                  <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-gold" aria-hidden="true" /><span className="sr-only">Cartões amarelos:</span>{p.yellow_cards}
                                </span>
                              )}
                              {p.red_cards > 0 && (
                                <span className="px-2 py-0.5 bg-csc-red/15 text-csc-vermelho-texto rounded-lg border border-csc-red/35 flex items-center gap-1">
                                  <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-red" aria-hidden="true" /><span className="sr-only">Cartão vermelho</span>
                                </span>
                              )}
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
            </div>

            {/* 4. OCORRÊNCIAS & NOTAS TÉCNICAS (ÁREA PRIVADA: APENAS COACH / ADMIN) */}
            {isCoachOrAdmin && (
              <div className="p-4 sm:p-5 bg-csc-gold/10 border border-csc-gold/35 rounded-3xl space-y-2.5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-csc-gold font-black text-xs uppercase tracking-wider">
                    <Lock size={15} className="text-csc-gold" />
                    <span>Ocorrências & Notas da Equipa Técnica</span>
                  </div>
                  <span className="text-[10px] font-extrabold text-csc-gold bg-csc-gold/18 px-2 py-0.5 rounded-full border border-csc-gold/30">
                    Confidencial
                  </span>
                </div>
                <p className="text-[11px] text-white/60 font-medium">
                  Registo interno de lesões, comportamento, observações táticas ou incidências do jogo. <strong>Os jogadores não têm acesso a estas notas.</strong>
                </p>

                <div className="p-3 bg-white/5 rounded-2xl border border-csc-gold/22 text-xs font-semibold text-white/80">
                  {occurrences ? (
                    <p className="whitespace-pre-wrap">{occurrences}</p>
                  ) : (
                    <p className="italic text-white/65">Sem ocorrências registadas para este jogo.</p>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </VistaDetalhe>

    {/* Edição da Ficha de Jogo — formulário próprio, não a persiana de consulta:
        pede um contentor mais deliberado, sem o gesto de arrastar que a fecharia
        por engano com alterações por guardar. */}
    <Modal
      isOpen={isEditModalOpen && !loading && !jogoPorRealizar}
      onClose={guardaFicha.tentarFechar}
      size="3xl"
      stacked
      title="Editar ficha de jogo"
      description={`${leftSigla} vs ${rightSigla}`}
      icon={<Pencil size={20} className="text-csc-gold" />}
      closeOnOverlayClick={false}
      footer={
        <>
          <button
            type="button"
            onClick={guardaFicha.tentarFechar}
            className="px-4 py-2.5 text-xs font-bold text-white hover:text-white bg-white/10 hover:bg-white/20 rounded-xl cursor-pointer transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSaveReport()}
            disabled={saving}
            className="px-5 py-2.5 text-xs font-black text-csc-dark bg-csc-gold hover:brightness-95 rounded-xl cursor-pointer shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={16} className="text-csc-dark" />
            <span>{saving ? 'A guardar…' : 'Guardar ficha de jogo'}</span>
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Resultado */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-white/70 uppercase tracking-wider mb-1">{leftSigla}</label>
            <input
              type="number"
              min="0"
              value={homeScore ?? ''}
              onChange={e => setHomeScore(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              placeholder="0"
              className="w-full h-[52px] text-center bg-white text-csc-tinta font-display text-[22px] font-black rounded-[14px] border-2 border-csc-gold outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-white/70 uppercase tracking-wider mb-1">{rightSigla}</label>
            <input
              type="number"
              min="0"
              value={awayScore ?? ''}
              onChange={e => setAwayScore(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              placeholder="0"
              className="w-full h-[52px] text-center bg-white text-csc-tinta font-display text-[22px] font-black rounded-[14px] border-2 border-csc-gold outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
            />
          </div>
        </div>

        {/*
          A conta à vista enquanto se escreve, e não só ao gravar: quem soma
          quatro golos num jogo de dois vê-o na linha de baixo antes de chegar
          ao botão.
        */}
        {(golosAMais !== 0 || semResultado) && (
          <p
            role="status"
            className={`flex items-center gap-1.5 text-[11px] leading-snug font-bold ${
              golosAMais > 0 || semResultado ? 'text-csc-vermelho-texto' : 'text-amber-300'
            }`}
          >
            <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
            {semResultado
              ? `Os atletas somam ${golosDosAtletas} ${golosDosAtletas === 1 ? 'golo' : 'golos'} e o resultado está por preencher.`
              : golosAMais > 0
                ? `Os atletas somam ${golosDosAtletas} golos, mais ${golosAMais} do que os ${nossosGolos} do resultado.`
                : `${-golosAMais} ${-golosAMais === 1 ? 'golo do resultado está' : 'golos do resultado estão'} sem marcador. Um autogolo do adversário conta para nós e não tem marcador.`}
          </p>
        )}

        {/* Esquema Tático */}
        <div>
          <label className="block text-[11px] font-bold text-white/70 uppercase tracking-wider mb-1">Esquema Tático</label>
          <select
            value={tacticalFormation}
            onChange={e => setTacticalFormation(e.target.value)}
            className="w-full h-[46px] px-3.5 bg-white text-csc-tinta rounded-[14px] font-display font-bold text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
          >
            {TACTICAL_FORMATIONS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Plantel: titulares, suplentes, golos e cartões */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Desempenho dos Atletas</label>
            <span className="text-[10px] text-white/70 font-normal">Titulares: {starters.length} | Suplentes: {subs.length}</span>
          </div>
          <div className="bg-white/[0.07] rounded-2xl border border-white/10 border-t-white/20 overflow-hidden shadow-lg shadow-black/20">
            <div className="p-2.5 space-y-2 max-h-[45vh] overflow-y-auto">
              {playerStats.map(p => {
                const displayName = p.shirt_name || p.name
                return (
                <div key={p.player_id} className="p-3 flex flex-col gap-2.5 bg-white/5 border border-white/10 rounded-2xl">

                  {/* Quem é, e se foi MVP. */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[11px] flex items-center justify-center shrink-0">
                      {p.jersey_number || '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-black text-[13px] text-white truncate">{displayName}</span>
                      {p.position && (
                        <span className="block text-[9.5px] text-white/62 truncate mt-0.5">
                          {p.position.split(',').map((pos: string) => pos.trim()).filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleMvp(p.player_id)}
                      aria-pressed={p.is_mvp}
                      title="Melhor em campo"
                      className={`min-h-11 px-3 rounded-[18px] border font-display font-black text-[10.5px] shrink-0 cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                          p.is_mvp
                            ? 'bg-csc-gold text-csc-tinta border-csc-gold'
                            : 'bg-white/6 border-white/12 text-white/62'
                        }`}
                    >
                      MVP
                    </button>
                  </div>

                  {/* Titular, suplente ou não jogou — os três lados da mesma escolha. */}
                  <div className="grid grid-cols-3 gap-1 bg-white/6 p-1 rounded-2xl border border-white/10">
                    {([
                      ['starter', 'Titular'],
                      ['sub', 'Suplente'],
                      ['none', 'Não jogou'],
                    ] as const).map(([valor, etiqueta]) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => valor === 'starter'
                          ? handleSetStarter(p.player_id)
                          : handleStatChange(p.player_id, 'lineup_status', valor)}
                        aria-pressed={p.lineup_status === valor}
                        className={`min-h-11 rounded-[14px] font-display font-black text-[11px] cursor-pointer
                          transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                            p.lineup_status === valor
                              ? 'bg-csc-gold text-csc-tinta'
                              : 'text-white/62'
                          }`}
                      >
                        {etiqueta}
                      </button>
                    ))}
                  </div>

                  {/* Golos e assistências, ao passo de um. */}
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['goals', 'Golos', p.goals, 'text-csc-gold'],
                      ['assists', 'Ass.', p.assists, 'text-csc-azul-texto'],
                    ] as const).map(([campo, etiqueta, valor, cor]) => (
                      /* A etiqueta vai por cima e não ao lado: com ela na
                         mesma linha, os dois botões de 36px e o número não
                         cabiam em meia coluna e o "+" saía da caixa. */
                      <div key={campo} className="bg-white/6 border border-white/10 rounded-2xl px-2 py-1.5">
                        <span className={`block text-center font-display font-black text-[8.5px] tracking-[0.12em] uppercase ${cor}`}>
                          {etiqueta}
                        </span>
                        <span className="flex items-center justify-between gap-1 mt-0.5">
                        <button
                          type="button"
                          onClick={() => handleStatChange(p.player_id, campo, Math.max(0, valor - 1))}
                          aria-label={`Menos um em ${etiqueta.toLowerCase()} de ${displayName}`}
                          disabled={valor === 0}
                          className="w-9 h-9 rounded-xl bg-white/8 text-white font-display font-black flex items-center justify-center shrink-0 cursor-pointer
                            transition-transform duration-150 active:scale-97 disabled:opacity-30 disabled:cursor-not-allowed
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                        >
                          −
                        </button>
                        <span className={`flex-1 text-center font-display font-black text-[15px] tabular-nums ${cor}`}>
                          {valor}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleStatChange(p.player_id, campo, valor + 1)
                            if (p.lineup_status === 'none') handlePromoteIfNone(p.player_id)
                          }}
                          aria-label={`Mais um em ${etiqueta.toLowerCase()} de ${displayName}`}
                          className="w-9 h-9 rounded-xl bg-white/8 text-white font-display font-black flex items-center justify-center shrink-0 cursor-pointer
                            transition-transform duration-150 active:scale-97
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                        >
                          +
                        </button>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Os dois cartões. O amarelo dá a volta 0 → 1 → 2 → 0. */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatChange(p.player_id, 'yellow_cards', (p.yellow_cards + 1) % 3)}
                      aria-label={`Cartões amarelos de ${displayName}: ${p.yellow_cards}`}
                      title="Alternar cartões amarelos (0 → 1 → 2)"
                      className={`min-h-11 rounded-2xl border font-display font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                          p.yellow_cards > 0
                            ? 'bg-csc-gold/18 border-csc-gold/45 text-csc-gold'
                            : 'bg-white/6 border-white/12 text-white/62'
                        }`}
                    >
                      <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-gold" aria-hidden="true" />
                      {p.yellow_cards > 0 ? `x${p.yellow_cards}` : '0'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatChange(p.player_id, 'red_cards', p.red_cards === 1 ? 0 : 1)}
                      aria-label={`Cartão vermelho de ${displayName}: ${p.red_cards === 1 ? 'sim' : 'não'}`}
                      title="Alternar cartão vermelho direto"
                      className={`min-h-11 rounded-2xl border font-display font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                          p.red_cards === 1
                            ? 'bg-csc-red/20 border-csc-red/45 text-csc-vermelho-texto'
                            : 'bg-white/6 border-white/12 text-white/62'
                        }`}
                    >
                      <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-red" aria-hidden="true" />
                      {p.red_cards === 1 ? 'x1' : '0'}
                    </button>
                  </div>

                </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Ocorrências & Notas Técnicas (privado) */}
        {isCoachOrAdmin && (
          <div>
            <div className="flex items-center gap-2 text-csc-gold font-black text-xs uppercase tracking-wider mb-1">
              <Lock size={14} className="text-csc-gold" />
              <span>Ocorrências & Notas da Equipa Técnica (Confidencial)</span>
            </div>
            <textarea
              rows={3}
              value={occurrences}
              onChange={e => setOccurrences(e.target.value)}
              placeholder="Ex: O atleta #7 saiu lesionado aos 35 min (entorse tornozelo). Bom comportamento coletivo na segunda parte..."
              className="w-full p-3 bg-white/5 border border-csc-gold/30 rounded-2xl text-xs font-semibold text-white outline-none focus:ring-2 focus-visible:ring-csc-gold shadow-inner"
            />
          </div>
        )}
      </div>
    </Modal>

    <UnsavedChangesModal {...guardaFicha.props} />
    <ConfirmModal
      isOpen={golosSemMarcador}
      title="Golos sem marcador"
      description={
        `O resultado dá ${nossosGolos} ao ${CLUBE_SIGLA} e os atletas somam ${golosDosAtletas}.` +
        ' Um autogolo do adversário conta para nós e não tem marcador — se não foi isso,' +
        ' falta atribuir o golo a alguém.'
      }
      confirmText="Gravar assim"
      variant="warning"
      onConfirm={() => { setGolosSemMarcador(false); handleSaveReport(true) }}
      onCancel={() => setGolosSemMarcador(false)}
    />
    </>
  )
}
