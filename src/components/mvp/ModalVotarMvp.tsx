import React, { useEffect, useState } from 'react'
import { Award, Check, Sparkles, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { eAdepto, eTreinador, eAdmin } from '../../lib/papeis'
import { compararPorCamisola } from '../../lib/eventos'
import { registarVotoMvp, obterVotosDoJogo, type MvpVote, type PlayerSummary } from '../../lib/mvp'
import { triggerHaptic } from '../../utils/haptics'
import { toast } from '../../context/ToastContext'
import { BottomSheet } from '../BottomSheet'
import { Botao, ACarregar } from '../ui'

interface ModalVotarMvpProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
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
  eventTitle = 'Jogo',
  eventDate,
  scoreText,
  onVoteSubmitted,
}) => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [players, setPlayers] = useState<PlayerVoteOption[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [initialVote, setInitialVote] = useState<MvpVote | null>(null)
  const [isEligible, setIsEligible] = useState(true)

  useEffect(() => {
    if (!isOpen || !eventId || !profile?.id) return

    let cancelado = false
    const carregar = async () => {
      setLoading(true)
      try {
        const [{ data: profilesData }, { data: callupsData }, { data: statsData }, votosDoJogo] =
          await Promise.all([
            supabase
              .from('v_players_public')
              .select('id, name, shirt_name, jersey_number, photo_url, position, role, roles')
              .order('jersey_number', { ascending: true, nullsFirst: false }),
            supabase.from('callups').select('player_id, status, notes').eq('event_id', eventId),
            supabase.from('stats').select('*').eq('event_id', eventId),
            obterVotosDoJogo(eventId),
          ])

        if (cancelado) return

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

        // Verificar se o utilizador já votou
        const meuVoto = votosDoJogo.find(v => v.voter_id === profile.id)
        if (meuVoto) {
          setInitialVote(meuVoto)
          setSelectedIds([meuVoto.player1_id, meuVoto.player2_id].filter(Boolean))
        } else {
          setInitialVote(null)
          setSelectedIds([])
        }

        // Verificar elegibilidade: apenas convocados (não recusados) ou participantes ou equipa técnica
        const isStaff = profile ? (eTreinador(profile) || eAdmin(profile)) : false
        const myCallup = profile?.id ? callupMap.get(profile.id) : null
        const myStat = profile?.id ? statMap.get(profile.id) : null
        const isConvocadoOuParticipante = Boolean(
          (myCallup && myCallup.status !== 'declined') ||
          (myStat && (myStat.lineup_status !== 'none' || myStat.goals > 0 || myStat.assists > 0 || myStat.yellow_cards > 0 || myStat.red_cards > 0))
        )
        setIsEligible(Boolean(isStaff || isConvocadoOuParticipante))
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
    if (!isEligible) {
      toast.warning('Apenas os atletas convocados e a equipa técnica têm direito de voto.')
      return
    }
    triggerHaptic('light')
    if (selectedIds.includes(playerId)) {
      setSelectedIds(prev => prev.filter(id => id !== playerId))
    } else {
      if (selectedIds.length >= 2) {
        toast.warning('Já escolheste 2 jogadores. Desmarca um para selecionar outro.')
        return
      }
      setSelectedIds(prev => [...prev, playerId])
    }
  }

  const handleSubmit = async () => {
    if (!profile?.id) {
      toast.error('Inicia sessão para poderes votar.')
      return
    }
    if (!isEligible) {
      toast.error('Apenas atletas convocados e equipa técnica podem votar.')
      return
    }
    if (selectedIds.length !== 2) {
      toast.warning('Deves selecionar exatamente 2 jogadores.')
      return
    }

    setSubmitting(true)
    try {
      const res = await registarVotoMvp(eventId, profile.id, selectedIds[0], selectedIds[1])
      if (res.ok) {
        triggerHaptic('medium')
        toast.success(initialVote ? 'Os teus votos de MVP foram atualizados!' : 'Voto registado com sucesso! Obrigado!')
        if (onVoteSubmitted) onVoteSubmitted()
        onClose()
      } else {
        toast.error(res.error || 'Não foi possível gravar o voto.')
      }
    } catch {
      toast.error('Ocorreu um erro ao submeter o teu voto.')
    } finally {
      setSubmitting(false)
    }
  }

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
              Cada pessoa vota em <strong>dois jogadores</strong> que achou terem estado melhor. O jogador com mais votos no final será eleito o MVP da partida.
            </p>
          </div>
        </div>

        {!isEligible && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-2xl text-xs text-red-200 flex items-center gap-2.5">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="leading-snug">
              Apenas os atletas convocados para esta partida e a equipa técnica têm direito de voto para o MVP.
            </p>
          </div>
        )}

        {/* Indicador de Seleção */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-display font-bold text-white/70">
            Escolhe 2 jogadores:
          </span>
          <span
            className={`text-xs font-display font-extrabold px-2.5 py-1 rounded-full ${
              selectedIds.length === 2
                ? 'bg-csc-gold/20 text-csc-gold border border-csc-gold/40'
                : selectedIds.length === 1
                ? 'bg-csc-blue/20 text-csc-azul-texto border border-csc-blue/40'
                : 'bg-white/10 text-white/60'
            }`}
          >
            {selectedIds.length} de 2 selecionados
          </span>
        </div>

        {loading ? (
          <ACarregar texto="A carregar convocados do jogo..." />
        ) : players.length === 0 ? (
          <div className="text-center py-8 text-white/60 text-xs">
            Nenhum atleta associado a este jogo.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
            {players.map(p => {
              const isSelected = selectedIds.includes(p.id)
              const displayName = p.shirt_name || p.name

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleTogglePlayer(p.id)}
                  className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 transition-all duration-150 cursor-pointer border ${
                    isSelected
                      ? 'bg-csc-gold/15 border-csc-gold shadow-md shadow-csc-gold/10'
                      : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-full font-display font-black text-xs flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-csc-gold text-csc-tinta border-csc-gold'
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

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                      isSelected
                        ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                        : 'border-white/25 bg-black/20 text-transparent'
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Botão de Gravação */}
        <div className="pt-2">
          <Botao
            onClick={handleSubmit}
            disabled={!isEligible || selectedIds.length !== 2 || submitting}
            className="w-full justify-center text-sm py-3"
          >
            {!isEligible
              ? 'Apenas convocados e equipa técnica podem votar'
              : submitting
              ? 'A gravar voto...'
              : selectedIds.length === 2
              ? initialVote
                ? 'Atualizar Votos'
                : 'Confirmar Voto (2 jogadores)'
              : `Seleciona mais ${2 - selectedIds.length} jogador${2 - selectedIds.length === 1 ? '' : 'es'}`}
          </Botao>
        </div>
      </div>
    </BottomSheet>
  )
}
