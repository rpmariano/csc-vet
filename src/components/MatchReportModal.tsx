import React, { useEffect, useState } from 'react'
import { X, ShieldAlert, Award, Footprints, Save, CheckCircle2, Lock, Flame, Users, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatClubSigla, formatOpponentSigla } from '../pages/CalendarPage'

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
  const [isEditing, setIsEditing] = useState(false)

  // Scores
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

        // If coach/admin and no score set yet, default to edit mode
        if (isCoachOrAdmin && (event?.home_score === null || event?.home_score === undefined)) {
          setIsEditing(true)
        } else {
          setIsEditing(false)
        }

        // 2. Fetch all profiles & callups for this event
        const [{ data: profilesData }, { data: callupsData }, { data: statsData }] = await Promise.all([
          supabase.from('profiles').select('id, name, shirt_name, jersey_number, photo_url, position, role, roles').order('jersey_number', { ascending: true, nullsFirst: false }),
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

  const handleToggleMvp = (playerId: string) => {
    setPlayerStats(prev => prev.map(p => ({
      ...p,
      is_mvp: p.player_id === playerId ? !p.is_mvp : false
    })))
  }

  const handleSaveReport = async () => {
    if (!isCoachOrAdmin) return
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
      setIsEditing(false)
      if (onSaved) onSaved()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving match report:', err)
      alert('Erro ao guardar a ficha de jogo. Por favor tenta novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const isAway = event?.home_away === 'away'
  const cscSigla = formatClubSigla()
  const oppSigla = formatOpponentSigla(event?.opponent)
  const leftSigla = isAway ? oppSigla : cscSigla
  const rightSigla = isAway ? cscSigla : oppSigla
  const leftName = isAway ? (event?.opponent?.name || 'Adversário') : 'GDS Cascais'
  const rightName = isAway ? 'GDS Cascais' : (event?.opponent?.name || 'Adversário')

  const starters = playerStats.filter(p => p.lineup_status === 'starter')
  const subs = playerStats.filter(p => p.lineup_status === 'sub')

  const totalGoals = playerStats.reduce((sum, p) => sum + p.goals, 0)
  const totalYellows = playerStats.reduce((sum, p) => sum + p.yellow_cards, 0)
  const totalReds = playerStats.reduce((sum, p) => sum + p.red_cards, 0)

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto animate-fade-in">
      <div className="bg-csc-dark text-white rounded-3xl max-w-3xl w-full p-5 sm:p-7 relative max-h-[92vh] overflow-y-auto shadow-2xl border-2 border-csc-gold/60 space-y-5">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/20 cursor-pointer z-20 bg-white/10 shadow-sm border border-white/10 transition-all active:scale-95"
          title="Fechar"
        >
          <X size={19} className="stroke-[2.5]" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 pr-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                Ficha Oficial de Jogo
              </span>
              {event?.is_friendly && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  Amigável
                </span>
              )}
              {event?.tournament && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                  {event.tournament.name}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              {leftSigla} Vs {rightSigla}
            </h2>
            <p className="text-xs text-white/50 font-medium">
              {event?.date_time && new Date(event.date_time).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {isCoachOrAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs ${
                  isEditing 
                    ? 'bg-white/10 text-white hover:bg-white/20 border border-white/15' 
                    : 'bg-csc-gold text-csc-dark hover:brightness-95 border border-csc-gold'
                }`}
              >
                {isEditing ? 'Ver Modo Resumo' : '✏️ Editar Ficha'}
              </button>
            </div>
          )}
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-500/10 border-2 border-emerald-400/40 rounded-2xl text-emerald-200 text-xs font-black flex items-center gap-2 animate-bounce-short">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>Ficha de jogo e estatísticas atualizadas com sucesso!</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-9 w-9 border-t-2 border-b-2 border-csc-gold mb-2"></div>
            <p className="text-xs font-bold text-white/50">A carregar dados do jogo...</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* 1. SCOREBOARD & RESULTADO */}
            <div className="bg-gradient-to-br from-csc-dark via-emerald-950 to-csc-dark text-white rounded-3xl p-5 sm:p-6 shadow-md border-2 border-csc-gold/80 relative overflow-hidden">
              <div className="grid grid-cols-11 items-center gap-3 text-center">
                
                {/* Equipa 1 */}
                <div className="col-span-4 flex flex-col items-center gap-1">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white p-1.5 shadow-md border border-white/30 flex items-center justify-center">
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
                  <span className="text-[11px] text-gray-300 truncate max-w-[120px] sm:max-w-[150px]">{leftName}</span>
                </div>

                {/* Placar Central */}
                <div className="col-span-3 flex flex-col items-center justify-center gap-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={homeScore ?? ''}
                        onChange={e => setHomeScore(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                        placeholder="0"
                        className="w-12 sm:w-14 text-center py-2 bg-white text-csc-dark text-xl sm:text-2xl font-black rounded-xl border-2 border-csc-gold outline-none shadow-inner"
                      />
                      <span className="text-xl font-black text-csc-gold">-</span>
                      <input
                        type="number"
                        min="0"
                        value={awayScore ?? ''}
                        onChange={e => setAwayScore(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                        placeholder="0"
                        className="w-12 sm:w-14 text-center py-2 bg-white text-csc-dark text-xl sm:text-2xl font-black rounded-xl border-2 border-csc-gold outline-none shadow-inner"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-3xl sm:text-4xl font-black text-white px-3 py-1 bg-black/40 rounded-2xl border border-white/20">
                        {homeScore !== null && homeScore !== undefined ? homeScore : '-'}
                      </span>
                      <span className="text-2xl font-black text-csc-gold">:</span>
                      <span className="text-3xl sm:text-4xl font-black text-white px-3 py-1 bg-black/40 rounded-2xl border border-white/20">
                        {awayScore !== null && awayScore !== undefined ? awayScore : '-'}
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-200">
                    {homeScore !== null ? 'Resultado Final' : 'Sem Resultado'}
                  </span>
                </div>

                {/* Equipa 2 */}
                <div className="col-span-4 flex flex-col items-center gap-1">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white p-1.5 shadow-md border border-white/30 flex items-center justify-center">
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
                  <span className="text-[11px] text-gray-300 truncate max-w-[120px] sm:max-w-[150px]">{rightName}</span>
                </div>

              </div>
            </div>

            {/* 2. ESQUEMA TÁTICO & RESUMO GERAL */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Esquema Tático
                </label>
                {isEditing ? (
                  <select
                    value={tacticalFormation}
                    onChange={e => setTacticalFormation(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-900 outline-none focus:ring-2 focus:ring-csc-dark"
                  >
                    {TACTICAL_FORMATIONS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-base font-black text-white flex items-center gap-1.5">
                    <span>⚡ {(tacticalFormation || '4-3-3').replace(/^1-/, '')}</span>
                  </p>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Golos da Equipa
                </label>
                <p className="text-base font-black text-amber-700 flex items-center gap-1.5">
                  <Flame size={18} className="text-amber-500" />
                  <span>{totalGoals} {totalGoals === 1 ? 'Golo' : 'Golos'}</span>
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Ações Disciplinares
                </label>
                <div className="flex items-center gap-3 text-xs font-black mt-1">
                  <span className="flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                    <ShieldAlert size={14} /> {totalYellows} Amarelos
                  </span>
                  <span className="flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-lg border border-red-300">
                    <ShieldAlert size={14} /> {totalReds} Vermelhos
                  </span>
                </div>
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

              {/* MODO VISUALIZAÇÃO (Para Jogadores ou Consulta) */}
              {!isEditing && (
                <div className="space-y-4">
                  {/* Titulares */}
                  <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-xs">
                    <div className="bg-emerald-800 text-white px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-between">
                      <span>⭐ Titulares ({starters.length})</span>
                      <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-700">{(tacticalFormation || '4-3-3').replace(/^1-/, '')}</span>
                    </div>
                    {starters.length === 0 ? (
                      <p className="p-4 text-xs text-white/50 font-semibold italic text-center">Nenhum titular registado.</p>
                    ) : (
                      <div className="divide-y divide-white/10">
                        {starters.map(p => {
                          const displayName = p.shirt_name || p.name
                          return (
                          <div key={p.player_id} className="p-3 sm:px-4 flex items-center justify-between gap-2 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 text-sm font-black flex items-center justify-center shrink-0 shadow-xs">
                                {p.jersey_number || '—'}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-black text-white truncate flex items-center gap-1.5">
                                  <span>{displayName}</span>
                                  {p.is_mvp && (
                                    <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-0.5">
                                      <Award size={10} className="text-amber-600" /> MVP
                                    </span>
                                  )}
                                </p>
                                {p.position && (
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {p.position.split(',').map((pos: string, idx: number) => (
                                      <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{pos.trim()}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Estatísticas do Atleta */}
                            <div className="flex items-center gap-2 shrink-0 text-xs font-black">
                              {p.goals > 0 && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-950 rounded-lg border border-amber-300 flex items-center gap-1">
                                  ⚽ {p.goals} {p.goals > 1 ? 'golos' : 'golo'}
                                </span>
                              )}
                              {p.assists > 0 && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded-lg border border-blue-200 flex items-center gap-1">
                                  <Footprints size={12} className="text-blue-600" /> {p.assists} ass
                                </span>
                              )}
                              {p.yellow_cards > 0 && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-900 rounded-lg border border-yellow-300 flex items-center gap-1">
                                  🟨 {p.yellow_cards === 2 ? '🟨' : ''}
                                </span>
                              )}
                              {p.red_cards > 0 && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-900 rounded-lg border border-red-300 flex items-center gap-1">
                                  🟥
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
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-xs">
                      <div className="bg-blue-900 text-white px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <span>🔄 Suplentes Utilizados ({subs.length})</span>
                      </div>
                      <div className="divide-y divide-white/10">
                        {subs.map(p => {
                          const displayName = p.shirt_name || p.name
                          return (
                          <div key={p.player_id} className="p-3 sm:px-4 flex items-center justify-between gap-2 hover:bg-white/10 transition-colors">
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
                                      <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{pos.trim()}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-xs font-black">
                              {p.goals > 0 && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-950 rounded-lg border border-amber-300 flex items-center gap-1">
                                  ⚽ {p.goals}
                                </span>
                              )}
                              {p.assists > 0 && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded-lg border border-blue-200 flex items-center gap-1">
                                  <Footprints size={12} className="text-blue-600" /> {p.assists} ass
                                </span>
                              )}
                              {p.yellow_cards > 0 && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-900 rounded-lg border border-yellow-300 flex items-center gap-1">
                                  🟨
                                </span>
                              )}
                              {p.red_cards > 0 && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-900 rounded-lg border border-red-300 flex items-center gap-1">
                                  🟥
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
              )}

              {/* MODO EDIÇÃO (Para Treinadores / Admins) */}
              {isEditing && (
                <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-xs">
                  <div className="p-3 bg-white/10 border-b border-white/10 text-xs font-bold text-white/80 flex items-center justify-between">
                    <span>Seleciona titulares, suplentes, golos e cartões:</span>
                    <span className="text-[10px] text-white/50 font-normal">Titulares: {starters.length} | Suplentes: {subs.length}</span>
                  </div>

                  <div className="divide-y divide-white/10 max-h-[45vh] overflow-y-auto">
                    {playerStats.map(p => {
                      const displayName = p.shirt_name || p.name
                      return (
                      <div key={p.player_id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/10 transition-colors">
                        
                        {/* Identificação e Seletor de Titularidade */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold font-black text-sm flex items-center justify-center shrink-0 shadow-xs border border-csc-gold/40">
                            {p.jersey_number || '—'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white truncate">{displayName}</p>
                            {p.position && (
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                {p.position.split(',').map((pos: string, idx: number) => (
                                  <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{pos.trim()}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Controlos de Estado, Golos e Cartões */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                          {/* Seletor de Estado */}
                          <div className="flex items-center bg-white/10 p-1 rounded-xl border border-white/10 text-[11px] font-black">
                            <button
                              type="button"
                              onClick={() => handleStatChange(p.player_id, 'lineup_status', 'starter')}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                p.lineup_status === 'starter' ? 'bg-emerald-600 text-white shadow-xs' : 'text-white/60 hover:text-white'
                              }`}
                            >
                              Titular
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatChange(p.player_id, 'lineup_status', 'sub')}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                p.lineup_status === 'sub' ? 'bg-blue-600 text-white shadow-xs' : 'text-white/60 hover:text-white'
                              }`}
                            >
                              Suplente
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatChange(p.player_id, 'lineup_status', 'none')}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                p.lineup_status === 'none' ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white/70'
                              }`}
                            >
                              Não Jogou
                            </button>
                          </div>

                          {/* Contador de Golos (⚽) */}
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1">
                            <span className="text-xs font-bold text-amber-900">⚽</span>
                            <button
                              type="button"
                              onClick={() => handleStatChange(p.player_id, 'goals', Math.max(0, p.goals - 1))}
                              className="w-5 h-5 rounded-lg bg-amber-200 text-amber-900 text-xs font-black flex items-center justify-center hover:bg-amber-300 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-xs font-black text-amber-950 w-4 text-center">{p.goals}</span>
                            <button
                              type="button"
                              onClick={() => {
                                handleStatChange(p.player_id, 'goals', p.goals + 1)
                                if (p.lineup_status === 'none') handleStatChange(p.player_id, 'lineup_status', 'starter')
                              }}
                              className="w-5 h-5 rounded-lg bg-amber-200 text-amber-900 text-xs font-black flex items-center justify-center hover:bg-amber-300 cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          {/* Contador de Assistências (👟) */}
                          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-xl px-2 py-1">
                            <Footprints size={13} className="text-blue-600 shrink-0" />
                            <button
                              type="button"
                              onClick={() => handleStatChange(p.player_id, 'assists', Math.max(0, p.assists - 1))}
                              className="w-5 h-5 rounded-lg bg-blue-200 text-blue-900 text-xs font-black flex items-center justify-center hover:bg-blue-300 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-xs font-black text-blue-950 w-4 text-center">{p.assists}</span>
                            <button
                              type="button"
                              onClick={() => {
                                handleStatChange(p.player_id, 'assists', p.assists + 1)
                                if (p.lineup_status === 'none') handleStatChange(p.player_id, 'lineup_status', 'starter')
                              }}
                              className="w-5 h-5 rounded-lg bg-blue-200 text-blue-900 text-xs font-black flex items-center justify-center hover:bg-blue-300 cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          {/* Cartões Amarelos (🟨) */}
                          <button
                            type="button"
                            onClick={() => handleStatChange(p.player_id, 'yellow_cards', (p.yellow_cards + 1) % 3)}
                            className={`px-2 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer ${
                              p.yellow_cards === 1
                                ? 'bg-yellow-200 border-yellow-400 text-yellow-950 ring-1 ring-yellow-400'
                                : p.yellow_cards === 2
                                ? 'bg-yellow-300 border-yellow-500 text-yellow-950 font-extrabold ring-2 ring-yellow-500'
                                : 'bg-white/10 border-white/10 text-white/30 hover:text-white/70'
                            }`}
                            title="Alternar Cartões Amarelos (0 -> 1 -> 2)"
                          >
                            🟨 {p.yellow_cards > 0 ? (p.yellow_cards === 2 ? 'x2' : 'x1') : '0'}
                          </button>

                          {/* Cartão Vermelho (🟥) */}
                          <button
                            type="button"
                            onClick={() => handleStatChange(p.player_id, 'red_cards', p.red_cards === 1 ? 0 : 1)}
                            className={`px-2 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer ${
                              p.red_cards === 1
                                ? 'bg-red-500 text-white border-red-600 ring-2 ring-red-400'
                                : 'bg-white/10 border-white/10 text-white/30 hover:text-white/70'
                            }`}
                            title="Alternar Cartão Vermelho Direto"
                          >
                            🟥 {p.red_cards === 1 ? '✓' : '0'}
                          </button>

                          {/* MVP (⭐) */}
                          <button
                            type="button"
                            onClick={() => handleToggleMvp(p.player_id)}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                              p.is_mvp
                                ? 'bg-amber-400 text-white border-amber-500 ring-2 ring-amber-300'
                                : 'bg-gray-100 border-gray-200 text-gray-400 hover:text-amber-600'
                            }`}
                            title="Melhor em Campo (MVP)"
                          >
                            <Sparkles size={14} className={p.is_mvp ? 'fill-white' : ''} />
                          </button>

                        </div>

                      </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 4. OCORRÊNCIAS & NOTAS TÉCNICAS (ÁREA PRIVADA: APENAS COACH / ADMIN) */}
            {isCoachOrAdmin && (
              <div className="p-4 sm:p-5 bg-amber-500/10 border-2 border-amber-400/40 rounded-3xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-200 font-black text-xs uppercase tracking-wider">
                    <Lock size={15} className="text-amber-400" />
                    <span>Ocorrências & Notas da Equipa Técnica</span>
                  </div>
                  <span className="text-[10px] font-extrabold text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-400/30">
                    🔒 Confidencial / Privado
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/70 font-medium">
                  Registo interno de lesões, comportamento, observações táticas ou incidências do jogo. <strong>Os jogadores não têm acesso a estas notas.</strong>
                </p>

                {isEditing ? (
                  <textarea
                    rows={3}
                    value={occurrences}
                    onChange={e => setOccurrences(e.target.value)}
                    placeholder="Ex: O atleta #7 saiu lesionado aos 35 min (entorse tornozelo). Bom comportamento coletivo na segunda parte..."
                    className="w-full p-3 bg-white/5 border border-amber-400/30 rounded-2xl text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-amber-400 shadow-inner"
                  />
                ) : (
                  <div className="p-3 bg-white/5 rounded-2xl border border-amber-400/20 text-xs font-semibold text-white/80">
                    {occurrences ? (
                      <p className="whitespace-pre-wrap">{occurrences}</p>
                    ) : (
                      <p className="italic text-white/40">Sem ocorrências registadas para este jogo.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Botões de Ação Final */}
            {isCoachOrAdmin && isEditing && (
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 text-xs font-bold text-white hover:text-white bg-white/10 hover:bg-white/20 rounded-xl cursor-pointer transition-all"
                >
                  Cancelar Edição
                </button>
                <button
                  type="button"
                  onClick={handleSaveReport}
                  disabled={saving}
                  className="px-5 py-2.5 text-xs font-black text-csc-dark bg-csc-gold hover:brightness-95 rounded-xl cursor-pointer shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Save size={16} className="text-csc-dark" />
                  <span>{saving ? 'A guardar...' : 'Guardar Ficha de Jogo'}</span>
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
