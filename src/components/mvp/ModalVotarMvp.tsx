import React, { useEffect, useState } from 'react'
import { Award, Check, Sparkles, AlertCircle, ArrowLeftRight, X, Trophy, Medal, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { eAdepto } from '../../lib/papeis'
import { compararPorCamisola } from '../../lib/eventos'
import { registarVotoMvp, obterVotosDoJogo, isVotacaoMvpAberta, salvarVotoMvpLocal, obterVotoMvpLocal, type MvpVote, type PlayerSummary } from '../../lib/mvp'
import { triggerHaptic } from '../../utils/haptics'
import { toast } from '../../context/ToastContext'
import { BottomSheet } from '../BottomSheet'
import { Botao, ACarregar } from '../ui'

interface ModalVotarMvpProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  event?: any
  eventTitle?: string
  eventDate?: string
  scoreText?: string
  onVoteSubmitted?: () => void
}

interface PlayerVoteOption extends PlayerSummary {
  goals?: number
  assists?: number
  lineup_status?: 'starter' | 'sub' | 'none'
}

export const ModalVotarMvp: React.FC<ModalVotarMvpProps> = ({
  isOpen,
  onClose,
  eventId,
  event: eventProp,
  eventTitle = 'Jogo',
  eventDate,
  scoreText,
  onVoteSubmitted,
}) => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [players, setPlayers] = useState<PlayerVoteOption[]>([])
  const [firstChoiceId, setFirstChoiceId] = useState<string | null>(null)
  const [secondChoiceId, setSecondChoiceId] = useState<string | null>(null)
  const [initialVote, setInitialVote] = useState<MvpVote | null>(null)
  const [isEligible, setIsEligible] = useState(true)
  const [votacaoEncerrada, setVotacaoEncerrada] = useState(false)

  useEffect(() => {
    if (!isOpen || !eventId || !profile?.id) return

    let cancelado = false
    const carregar = async () => {
      setLoading(true)
      try {
        const [
          { data: profilesData },
          { data: callupsData },
          { data: statsData },
          votosDoJogo,
          { data: eventData },
        ] = await Promise.all([
          supabase
            .from('v_players_public')
            .select('id, name, shirt_name, jersey_number, photo_url, position, role, roles')
            .order('jersey_number', { ascending: true, nullsFirst: false }),
          supabase.from('callups').select('player_id, status, notes').eq('event_id', eventId),
          supabase.from('stats').select('*').eq('event_id', eventId),
          obterVotosDoJogo(eventId, profile.id),
          supabase
            .from('events')
            .select('id, title, date_time, is_friendly, matchday, description, mvp_voting_closed, opponent:opponents(name, initials)')
            .eq('id', eventId)
            .maybeSingle(),
        ])

        if (cancelado) return

        const rawEvent = eventData || eventProp
        const opp = Array.isArray(rawEvent?.opponent) ? rawEvent.opponent[0] : rawEvent?.opponent
        const eventoObj = rawEvent ? { ...rawEvent, opponent: opp } : null
        const aberta = isVotacaoMvpAberta(eventoObj)
        setVotacaoEncerrada(!aberta)

        const callupMap = new Map((callupsData || []).map(c => [c.player_id, c]))
        const statMap = new Map((statsData || []).map(s => [s.player_id, s]))

        const allProfiles = profilesData || []
        // Jogadores elegíveis para voto: quem foi convocado ou tem estatística no jogo
        const relevantProfiles = allProfiles.filter(p => {
          if (callupMap.has(p.id)) return true
          if (statMap.has(p.id)) return true
          return false
        })

        const candidates = (relevantProfiles.length > 0 ? relevantProfiles : allProfiles.filter(p => p.role === 'player'))
          .filter(p => !eAdepto(p))
          .sort(compararPorCamisola)

        const options: PlayerVoteOption[] = candidates.map(p => {
          const st = statMap.get(p.id)
          const callup = callupMap.get(p.id)

          let lineup_status: 'starter' | 'sub' | 'none' = 'none'
          if (callup?.notes?.includes('starter') || st?.is_starter) {
            lineup_status = 'starter'
          } else if (callup?.notes?.includes('sub') || (st && (st.goals > 0 || st.assists > 0))) {
            lineup_status = 'sub'
          }

          return {
            id: p.id,
            name: p.name,
            shirt_name: p.shirt_name,
            jersey_number: p.jersey_number,
            photo_url: p.photo_url,
            position: p.position,
            goals: st?.goals || 0,
            assists: st?.assists || 0,
            lineup_status,
          }
        })

        setPlayers(options)

        // Verificar se o utilizador já votou (remotamente ou em cache local)
        const meuVoto = votosDoJogo.find(v => v.voter_id === profile.id) || obterVotoMvpLocal(eventId, profile.id)
        if (meuVoto) {
          setInitialVote(meuVoto)
          setFirstChoiceId(meuVoto.player1_id || null)
          setSecondChoiceId(meuVoto.player2_id || null)
        } else {
          setInitialVote(null)
          setFirstChoiceId(null)
          setSecondChoiceId(null)
        }

        // Elegibilidade: aberto a todos os utilizadores autenticados da aplicação
        setIsEligible(Boolean(profile?.id))
      } catch (err) {
        console.error('Erro ao carregar dados de votação MVP:', err)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [isOpen, eventId, profile])

  const handleTogglePlayer = (playerId: string) => {
    if (votacaoEncerrada) {
      toast.warning('A votação de MVP para este jogo já se encontra encerrada.')
      return
    }
    if (initialVote) {
      toast.info('O teu voto já foi submetido anteriormente e não pode ser alterado.')
      return
    }
    if (!isEligible) {
      toast.warning('Inicia sessão na aplicação para poderes votar no MVP.')
      return
    }
    triggerHaptic('light')

    if (firstChoiceId === playerId) {
      setFirstChoiceId(null)
      return
    }
    if (secondChoiceId === playerId) {
      setSecondChoiceId(null)
      return
    }

    if (!firstChoiceId) {
      setFirstChoiceId(playerId)
    } else if (!secondChoiceId) {
      setSecondChoiceId(playerId)
    } else {
      toast.warning('Já escolheste o 1º e o 2º melhor. Remove um para selecionar outro.')
    }
  }

  const handleSwapChoices = () => {
    if (votacaoEncerrada || initialVote || (!firstChoiceId && !secondChoiceId)) return
    triggerHaptic('medium')
    setFirstChoiceId(secondChoiceId)
    setSecondChoiceId(firstChoiceId)
  }

  const handleSubmit = async () => {
    if (votacaoEncerrada) {
      toast.warning('A votação de MVP para este jogo já se encontra encerrada.')
      return
    }
    if (initialVote) {
      toast.warning('O teu voto já foi submetido anteriormente e não pode ser alterado.')
      return
    }
    if (!profile?.id) {
      toast.error('Inicia sessão para poderes votar.')
      return
    }
    if (!isEligible) {
      toast.error('Inicia sessão na aplicação para poderes votar no MVP.')
      return
    }
    if (!firstChoiceId || !secondChoiceId) {
      toast.warning('Deves selecionar o 1º melhor (3 pts) e o 2º melhor (1 pt).')
      return
    }
    if (firstChoiceId === secondChoiceId) {
      toast.warning('Tens de escolher dois jogadores diferentes.')
      return
    }

    setSubmitting(true)
    try {
      const res = await registarVotoMvp(eventId, profile.id, firstChoiceId, secondChoiceId)
      if (res.ok) {
        salvarVotoMvpLocal(eventId, profile.id, firstChoiceId, secondChoiceId)
        setInitialVote({
          id: `voto_${eventId}_${profile.id}`,
          event_id: eventId,
          voter_id: profile.id,
          player1_id: firstChoiceId,
          player2_id: secondChoiceId,
        })
        triggerHaptic('medium')
        toast.success('Voto registado com sucesso! Obrigado!')
        if (onVoteSubmitted) onVoteSubmitted()
        onClose()
      } else {
        toast.error(res.error || 'Não foi possível gravar o voto.')
        if (res.error?.includes('já foi submetido') || res.error?.includes('não pode ser alterado')) {
          const votoLocal = obterVotoMvpLocal(eventId, profile.id)
          if (votoLocal) {
            setInitialVote(votoLocal)
            setFirstChoiceId(votoLocal.player1_id || null)
            setSecondChoiceId(votoLocal.player2_id || null)
          }
          if (onVoteSubmitted) onVoteSubmitted()
        }
      }
    } catch {
      toast.error('Ocorreu um erro ao submeter o teu voto.')
    } finally {
      setSubmitting(false)
    }
  }

  const firstPlayer = players.find(p => p.id === firstChoiceId)
  const secondPlayer = players.find(p => p.id === secondChoiceId)

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Votação de MVP">
      <div className="space-y-4 pb-2">
        {/* Cabeçalho do jogo */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-extrabold text-[10px] tracking-wider uppercase text-csc-gold flex items-center gap-1.5">
              <Award size={14} className="text-csc-gold" />
              Melhor em Campo
            </span>
            {scoreText && (
              <span className="font-display font-black text-xs text-white/90 bg-white/10 px-2 py-0.5 rounded-md">
                {scoreText}
              </span>
            )}
          </div>
          <h3 className="font-display font-extrabold text-base text-white mt-1 truncate">
            {eventTitle}
          </h3>
          {eventDate && (
            <p className="text-xs text-white/60 mt-0.5 capitalize">{eventDate}</p>
          )}

          <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2 text-xs text-white/80">
            <Sparkles size={15} className="text-csc-gold shrink-0 mt-0.5" />
            <p className="leading-snug">
              Vota no que consideras o <strong>Melhor (3 pontos)</strong> e no <strong>Segundo Melhor (1 ponto)</strong>. O jogador com mais pontos no total deste jogo será eleito o MVP!
            </p>
          </div>
        </div>

        {votacaoEncerrada && (
          <div className="p-3 bg-white/10 border border-white/20 rounded-2xl text-xs text-white/80 flex items-center gap-2.5">
            <Lock size={18} className="text-white/60 shrink-0" />
            <p className="leading-snug">
              A votação de MVP para este jogo já se encontra encerrada.
            </p>
          </div>
        )}

        {initialVote && (
          <div className="p-3 bg-csc-verde-suave/20 border border-csc-verde-suave/40 rounded-2xl text-xs text-csc-verde-texto flex items-center gap-2.5">
            <Check size={18} className="text-csc-verde-texto shrink-0" />
            <p className="leading-snug font-semibold text-white">
              O teu voto já foi submetido. De acordo com o regulamento, uma vez submetido o voto não pode ser alterado.
            </p>
          </div>
        )}

        {!isEligible && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-2xl text-xs text-red-200 flex items-center gap-2.5">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="leading-snug">
              Inicia sessão na aplicação para poderes votar no MVP deste jogo.
            </p>
          </div>
        )}

        {/* Caixas de Seleção dos 2 Lugares (1º Lugar - 3 pts / 2º Lugar - 1 pt) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-display font-extrabold text-white/80 uppercase tracking-wider">
              As tuas escolhas:
            </span>
            {firstChoiceId && secondChoiceId && !initialVote && (
              <button
                type="button"
                onClick={handleSwapChoices}
                className="text-[11px] font-display font-bold text-csc-gold hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                title="Trocar ordem de votos"
              >
                <ArrowLeftRight size={12} />
                <span>Trocar ordem</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Slot 1º Lugar (3 pts) */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                firstPlayer
                  ? 'bg-csc-gold/15 border-csc-gold shadow-sm shadow-csc-gold/10'
                  : 'bg-white/[0.03] border-dashed border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10.5px] font-display font-black uppercase tracking-wider text-csc-gold flex items-center gap-1">
                  <Trophy size={13} className="text-csc-gold" />
                  1º Lugar · 3 Pontos
                </span>
                {firstPlayer && !initialVote && (
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setFirstChoiceId(null) }}
                    className="p-1 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    title="Remover 1º lugar"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {firstPlayer ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-csc-gold text-csc-tinta font-display font-black text-xs flex items-center justify-center shrink-0">
                    {firstPlayer.jersey_number || '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-extrabold text-xs text-white truncate">
                      {firstPlayer.shirt_name || firstPlayer.name}
                    </p>
                    <p className="text-[10px] text-csc-gold truncate font-semibold">
                      Melhor do jogo (+3 pts)
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-white/40 italic py-1">
                  Toca num atleta abaixo para definir o 1º
                </p>
              )}
            </div>

            {/* Slot 2º Lugar (1 pt) */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                secondPlayer
                  ? 'bg-csc-blue/20 border-csc-blue/50 shadow-sm shadow-csc-blue/10'
                  : 'bg-white/[0.03] border-dashed border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10.5px] font-display font-black uppercase tracking-wider text-csc-azul-texto flex items-center gap-1">
                  <Medal size={13} className="text-csc-azul-texto" />
                  2º Lugar · 1 Ponto
                </span>
                {secondPlayer && !initialVote && (
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setSecondChoiceId(null) }}
                    className="p-1 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    title="Remover 2º lugar"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {secondPlayer ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-csc-blue text-white font-display font-black text-xs flex items-center justify-center shrink-0">
                    {secondPlayer.jersey_number || '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-extrabold text-xs text-white truncate">
                      {secondPlayer.shirt_name || secondPlayer.name}
                    </p>
                    <p className="text-[10px] text-csc-azul-texto truncate font-semibold">
                      2º melhor do jogo (+1 pt)
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-white/40 italic py-1">
                  Toca num atleta abaixo para definir o 2º
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Lista de Atletas Disponíveis */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-xs font-display font-bold text-white/70">
              Plantel do jogo ({players.length}):
            </span>
          </div>

          {loading ? (
            <ACarregar texto="A carregar convocados do jogo..." />
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-white/60 text-xs">
              Nenhum atleta associado a este jogo.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
              {players.map(p => {
                const isFirst = firstChoiceId === p.id
                const isSecond = secondChoiceId === p.id
                const displayName = p.shirt_name || p.name

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleTogglePlayer(p.id)}
                    disabled={Boolean(initialVote) || votacaoEncerrada}
                    className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 transition-all duration-150 border ${
                      Boolean(initialVote) || votacaoEncerrada
                        ? 'cursor-default opacity-75'
                        : 'cursor-pointer hover:bg-white/[0.07]'
                    } ${
                      isFirst
                        ? 'bg-csc-gold/15 border-csc-gold shadow-md shadow-csc-gold/10 !opacity-100'
                        : isSecond
                        ? 'bg-csc-blue/20 border-csc-blue/60 shadow-md shadow-csc-blue/10 !opacity-100'
                        : 'bg-white/[0.04] border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-full font-display font-black text-xs flex items-center justify-center shrink-0 border ${
                          isFirst
                            ? 'bg-csc-gold text-csc-tinta border-csc-gold'
                            : isSecond
                            ? 'bg-csc-blue text-white border-csc-blue'
                            : 'bg-csc-dark text-csc-gold border-csc-gold/40'
                        }`}
                      >
                        {p.jersey_number || '—'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display font-extrabold text-[13px] text-white truncate">
                          {displayName}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/60 flex-wrap mt-0.5">
                          {p.position && <span>{p.position}</span>}
                          {p.goals ? (
                            <span className="text-csc-gold font-bold">⚽ {p.goals} golo{p.goals > 1 ? 's' : ''}</span>
                          ) : null}
                          {p.assists ? (
                            <span className="text-csc-azul-texto font-bold">👟 {p.assists} assist.</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFirst ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-csc-gold text-csc-tinta text-[11px] font-display font-black shadow-xs">
                          <Check size={13} strokeWidth={3} />
                          1º (3 pts)
                        </span>
                      ) : isSecond ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-csc-blue text-white text-[11px] font-display font-black shadow-xs">
                          <Check size={13} strokeWidth={3} />
                          2º (1 pt)
                        </span>
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-black/20 text-transparent">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Botão de Gravação */}
        <div className="pt-2">
          {votacaoEncerrada ? (
            <Botao
              onClick={onClose}
              aparencia="vidro"
              className="w-full justify-center text-sm py-3"
            >
              Votação Encerrada (Fechar)
            </Botao>
          ) : initialVote ? (
            <Botao
              onClick={onClose}
              aparencia="vidro"
              className="w-full justify-center text-sm py-3"
            >
              Voto já submetido (Fechar)
            </Botao>
          ) : (
            <Botao
              onClick={handleSubmit}
              disabled={!isEligible || !firstChoiceId || !secondChoiceId || submitting}
              className="w-full justify-center text-sm py-3"
            >
              {!isEligible
                ? 'Apenas convocados e treinadores podem votar'
                : submitting
                ? 'A gravar votos...'
                : firstChoiceId && secondChoiceId
                ? 'Confirmar Votos (3 pts + 1 pt)'
                : !firstChoiceId
                ? 'Escolhe o 1º Lugar (3 pts)'
                : 'Escolhe o 2º Lugar (1 pt)'}
            </Botao>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
