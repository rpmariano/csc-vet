import React, { useEffect, useState, useCallback } from 'react'
import { Award, ChevronRight, Sparkles, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { eAdepto, eTreinador, eJogador, eAdmin } from '../../lib/papeis'
import { obterTodosVotosMvp, isVotacaoMvpAberta } from '../../lib/mvp'
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

export async function fecharNotificacoesMvp(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const notifs = await reg.getNotifications()
    notifs.forEach((n) => {
      const tag = (n.tag || '').toLowerCase()
      const title = (n.title || '').toLowerCase()
      if (
        tag.startsWith('voto_mvp') ||
        tag.includes('teste') ||
        title.includes('mvp') ||
        title.includes('votação de mvp')
      ) {
        n.close()
      }
    })
  } catch (e) {
    console.debug('Erro ao fechar notificações de MVP:', e)
  }
}

export const AlertaMvpPendente: React.FC = () => {
  const { profile } = useAuth()
  const [jogosPendentes, setJogosPendentes] = useState<JogoPendenteMvp[]>([])
  const [jogoSelecionado, setJogoSelecionado] = useState<JogoPendenteMvp | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const verificarPendencias = useCallback(async () => {
    if (!profile?.id || eAdepto(profile)) return

    try {
      // Apenas treinadores ou atletas convocados podem votar. Direção pura não vota.
      const isDirecao = Boolean(profile && (eAdmin(profile) || profile.role === 'admin' || profile.roles?.includes('admin')))
      const isCoach = eTreinador(profile) && !isDirecao

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

      // Rui Mariano (administração): descartar alertas residuais de teste
      const emailNorm = (profile?.email || '').toLowerCase().trim()
      if (emailNorm === 'rpmariano@gmail.com' && !isCoach) {
        setJogosPendentes([])
        if (typeof window !== 'undefined' && window.location.search) {
          const url = new URL(window.location.href)
          let mudou = false
          if (url.searchParams.has('mvp_event')) {
            url.searchParams.delete('mvp_event')
            mudou = true
          }
          if (url.searchParams.has('test_mvp')) {
            url.searchParams.delete('test_mvp')
            mudou = true
          }
          if (url.searchParams.has('test_mvp_alert')) {
            url.searchParams.delete('test_mvp_alert')
            mudou = true
          }
          if (mudou) {
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''))
          }
        }
        fecharNotificacoesMvp()
        return
      }

      // Jogos elegíveis onde ainda não votou
      const pendentes: JogoPendenteMvp[] = []
      const isPlayer = eJogador(profile)

      for (const ev of eventosData) {
        const opp = Array.isArray(ev.opponent) ? ev.opponent[0] : ev.opponent
        const evObj = { ...ev, opponent: opp }
        // Se a votação estiver encerrada (ex.: amigáveis passados e 1ª jornada), não gera alerta
        if (!isVotacaoMvpAberta(evObj)) continue

        // Elegível se convocado como jogador OU treinador
        const elegivel = (isPlayer && convocadosIds.has(ev.id)) || isCoach
        const jaVotou = meusVotosIds.has(ev.id)
        let dispensado = false
        try {
          dispensado = localStorage.getItem(`csc_mvp_alerta_dispensado_${ev.id}`) === 'true'
        } catch {
          // ignore
        }

        if (elegivel && !jaVotou && !dispensado) {
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

      // Abrir modal diretamente se o URL veio de uma notificação push (?mvp_event=ID)
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const mvpEventId = params?.get('mvp_event')
      if (mvpEventId) {
        const evAlvo = pendentes.find(e => e.id === mvpEventId)
        if (evAlvo) {
          setJogoSelecionado(evAlvo)
          setModalAberto(true)
        }
      }
    } catch (err) {
      console.warn('Erro ao verificar votos pendentes de MVP:', err)
    }
  }, [profile])

  useEffect(() => {
    fecharNotificacoesMvp()
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

  const dispensarAlerta = (e: React.MouseEvent, idJogo: string) => {
    e.stopPropagation()
    triggerHaptic('light')
    try {
      localStorage.setItem(`csc_mvp_alerta_dispensado_${idJogo}`, 'true')
    } catch {
      // ignore
    }
    setJogosPendentes((prev) => prev.filter((j) => j.id !== idJogo))
    fecharNotificacoesMvp()
    if (typeof window !== 'undefined' && window.location.search) {
      const url = new URL(window.location.href)
      if (url.searchParams.get('mvp_event') === idJogo) {
        url.searchParams.delete('mvp_event')
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''))
      }
    }
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
                Já saiu a ficha de jogo ({dataFmt}). Vota no <strong>Melhor (3 pts)</strong> e no <strong>2º Melhor (1 pt)</strong> em campo!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => dispensarAlerta(e, jogo.id)}
            className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Dispensar aviso"
            aria-label="Dispensar aviso de votação"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-white/50 italic flex items-center gap-1">
            <Sparkles size={11} className="text-csc-gold" />
            1º Lugar (3 pts) + 2º Lugar (1 pt)
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
