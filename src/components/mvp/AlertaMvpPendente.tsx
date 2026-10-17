import React, { useEffect, useState, useCallback } from 'react'
import { Award, ChevronRight, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { eAdepto, eTreinador, eAdmin } from '../../lib/papeis'
import { obterTodosVotosMvp } from '../../lib/mvp'
import { ModalVotarMvp } from './ModalVotarMvp'
import { CartaoSimples, EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

export interface JogoPendenteMvp {
  id: string
  title: string
  date_time: string
  home_away?: 'home' | 'away' | 'neutral' | null
  home_score?: number | null
  away_score?: number | null
  opponent?: { name: string; initials?: string | null } | null
}

export const AlertaMvpPendente: React.FC = () => {
  const { profile } = useAuth()
  const [jogosPendentes, setJogosPendentes] = useState<JogoPendenteMvp[]>([])
  const [jogoSelecionado, setJogoSelecionado] = useState<JogoPendenteMvp | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const verificarPendencias = useCallback(async () => {
    if (!profile?.id || eAdepto(profile)) return

    try {
      const isStaff = eTreinador(profile) || eAdmin(profile)

      // 1. Procurar jogos com resultado dos últimos 21 dias
      const dataLimite = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
      const { data: eventosData, error: errEventos } = await supabase
        .from('events')
        .select('id, title, date_time, home_away, home_score, away_score, opponent:opponents(name, initials)')
        .eq('type', 'match')
        .not('home_score', 'is', null)
        .gte('date_time', dataLimite)
        .order('date_time', { ascending: false })

      if (errEventos || !eventosData || eventosData.length === 0) {
        setJogosPendentes([])
        return
      }

      const matchIds = eventosData.map(e => e.id)

      // 2. Convocatórias do utilizador (não recusadas), presenças em jogo e votos existentes
      const [{ data: minhasConvocatorias }, { data: meusStats }, todosVotos] = await Promise.all([
        supabase
          .from('callups')
          .select('event_id')
          .eq('player_id', profile.id)
          .neq('status', 'declined')
          .in('event_id', matchIds),
        supabase
          .from('stats')
          .select('event_id')
          .eq('player_id', profile.id)
          .in('event_id', matchIds),
        obterTodosVotosMvp(),
      ])

      const convocadosIds = new Set([
        ...(minhasConvocatorias || []).map(c => c.event_id),
        ...(meusStats || []).map(s => s.event_id),
      ])
      const meusVotosIds = new Set(
        todosVotos.filter(v => v.voter_id === profile.id).map(v => v.event_id)
      )

      // Jogos elegíveis onde ainda não votou
      const pendentes: JogoPendenteMvp[] = []
      for (const ev of eventosData) {
        // Elegível se convocado OU equipa técnica/admin
        const elegivel = convocadosIds.has(ev.id) || isStaff
        const jaVotou = meusVotosIds.has(ev.id)

        if (elegivel && !jaVotou) {
          const opp = Array.isArray(ev.opponent) ? ev.opponent[0] : ev.opponent
          pendentes.push({
            id: ev.id,
            title: ev.title,
            date_time: ev.date_time,
            home_away: ev.home_away,
            home_score: ev.home_score,
            away_score: ev.away_score,
            opponent: opp,
          })
        }
      }

      setJogosPendentes(pendentes)
    } catch (err) {
      console.warn('Erro ao verificar votos pendentes de MVP:', err)
    }
  }, [profile])

  useEffect(() => {
    verificarPendencias()
  }, [verificarPendencias])

  if (jogosPendentes.length === 0) return null

  const jogo = jogosPendentes[0]
  const d = new Date(jogo.date_time)
  const dataFmt = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
  const placar =
    jogo.home_score !== null && jogo.away_score !== null
      ? jogo.home_away === 'away'
        ? `${jogo.away_score}-${jogo.home_score}`
        : `${jogo.home_score}-${jogo.away_score}`
      : ''

  const abrirVotacao = (j: JogoPendenteMvp) => {
    triggerHaptic('light')
    setJogoSelecionado(j)
    setModalAberto(true)
  }

  return (
    <>
      <CartaoSimples className="p-4 border-csc-gold/40 bg-gradient-to-r from-csc-gold/15 to-transparent relative overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0 border border-csc-gold/40 mt-0.5 shadow-sm">
              <Award size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <EtiquetaSeccao como="span" className="text-csc-gold font-display font-extrabold text-[10px] tracking-wider uppercase">
                  Votação de MVP
                </EtiquetaSeccao>
                {jogosPendentes.length > 1 && (
                  <span className="text-[10px] bg-csc-gold/20 text-csc-gold font-extrabold px-1.5 py-0.2 rounded-full border border-csc-gold/30">
                    {jogosPendentes.length} pendentes
                  </span>
                )}
              </div>

              <h4 className="font-display font-extrabold text-sm text-white mt-1 truncate">
                {jogo.opponent?.name ? `vs ${jogo.opponent.name}` : jogo.title}
                {placar ? ` (${placar})` : ''}
              </h4>

              <p className="text-[11.5px] text-white/70 mt-1 leading-snug">
                Já saiu a ficha de jogo ({dataFmt}). Vota nos <strong>2 jogadores</strong> que consideras terem estado melhor!
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-white/50 italic flex items-center gap-1">
            <Sparkles size={11} className="text-csc-gold" />
            2 votos por pessoa
          </span>
          <button
            type="button"
            onClick={() => abrirVotacao(jogo)}
            className="px-3.5 py-1.5 rounded-xl bg-csc-gold text-csc-tinta font-display font-extrabold text-xs
              hover:bg-csc-gold/90 transition-all flex items-center gap-1.5 shadow-md shadow-csc-gold/10 cursor-pointer
              active:scale-97"
          >
            <span>Votar no MVP</span>
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </CartaoSimples>

      {jogoSelecionado && (
        <ModalVotarMvp
          isOpen={modalAberto}
          onClose={() => {
            setModalAberto(false)
            setJogoSelecionado(null)
          }}
          eventId={jogoSelecionado.id}
          eventTitle={jogoSelecionado.title}
          eventDate={new Date(jogoSelecionado.date_time).toLocaleDateString('pt-PT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          scoreText={placar}
          onVoteSubmitted={verificarPendencias}
        />
      )}
    </>
  )
}
