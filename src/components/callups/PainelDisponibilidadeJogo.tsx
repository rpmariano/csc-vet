import React, { useEffect, useState, useMemo } from 'react'
import { Trophy, CheckCircle2, XCircle, Users, ChevronDown, ChevronUp, UserCheck, AlertCircle } from 'lucide-react'
import type { EventoComDataETipo, RespostaDisponibilidade } from '../../lib/disponibilidadeJogo'
import {
  obterDisponibilidadeAtleta,
  obterTodasDisponibilidadesDoJogo,
  gravarDisponibilidadeAtleta,
} from '../../lib/disponibilidadeJogo'
import type { Profile } from '../../context/AuthContext'
import { getPlayerDisplayName } from '../../lib/eventos'
import { eAdepto } from '../../lib/papeis'
import { triggerHaptic } from '../../utils/haptics'
import { supabase } from '../../lib/supabaseClient'

export interface PainelDisponibilidadeJogoProps {
  jogo: EventoComDataETipo
  playerId?: string
  isCoachOrAdmin?: boolean
  compacto?: boolean
  plantel?: readonly Profile[]
  aoEditarConvocatoria?: () => void
}

export const PainelDisponibilidadeJogo: React.FC<PainelDisponibilidadeJogoProps> = ({
  jogo,
  playerId,
  isCoachOrAdmin = false,
  compacto = false,
  plantel = [],
  aoEditarConvocatoria,
}) => {
  const [minhaResposta, setMinhaResposta] = useState<RespostaDisponibilidade | null>(null)
  const [todasRespostas, setTodasRespostas] = useState<Record<string, RespostaDisponibilidade>>({})
  const [aGravar, setAGravar] = useState(false)
  const [aMostrarLista, setAMostrarLista] = useState(false)
  const [plantelFallback, setPlantelFallback] = useState<Profile[]>([])

  // Se o plantel não tiver sido fornecido, carregar perfis ativos da BD
  useEffect(() => {
    if (plantel && plantel.length > 0) return

    let ativo = true
    supabase
      .from('profiles')
      .select('id, name, nickname, jersey_number, role, roles, status')
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (!error && data && ativo) {
          setPlantelFallback(data as Profile[])
        }
      })

    return () => {
      ativo = false
    }
  }, [plantel])

  const listaPlantel = useMemo(() => {
    return plantel && plantel.length > 0 ? plantel : plantelFallback
  }, [plantel, plantelFallback])

  // Filtrar apenas atletas (não adeptos nem staff puro se aplicável)
  const atletas = useMemo(() => {
    return listaPlantel.filter(p => !eAdepto(p))
  }, [listaPlantel])

  const carregarDados = () => {
    if (!jogo?.id) return

    if (playerId) {
      obterDisponibilidadeAtleta(jogo.id, playerId).then(setMinhaResposta)
    }

    obterTodasDisponibilidadesDoJogo(jogo.id).then(setTodasRespostas)
  }

  useEffect(() => {
    carregarDados()

    const handleAtualizacao = (e: Event) => {
      const custom = e as CustomEvent<{ matchId: string; playerId: string; status: RespostaDisponibilidade }>
      if (custom.detail?.matchId === jogo?.id) {
        setTodasRespostas(prev => ({ ...prev, [custom.detail.playerId]: custom.detail.status }))
        if (custom.detail.playerId === playerId) {
          setMinhaResposta(custom.detail.status)
        }
      }
    }

    window.addEventListener('csc_match_availability_updated', handleAtualizacao)

    // Subscrever alterações em tempo real via Supabase Realtime
    const channel = supabase
      .channel(`rt_painel_match_avail_${jogo?.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_availabilities', filter: `match_id=eq.${jogo?.id}` },
        payload => {
          const row = (payload.new || {}) as { player_id?: string; status?: RespostaDisponibilidade }
          if (row.player_id && row.status) {
            setTodasRespostas(prev => ({ ...prev, [row.player_id!]: row.status! }))
            if (row.player_id === playerId) {
              setMinhaResposta(row.status)
            }
          }
        },
      )
      .subscribe()

    return () => {
      window.removeEventListener('csc_match_availability_updated', handleAtualizacao)
      supabase.removeChannel(channel)
    }
  }, [jogo?.id, playerId])

  const responder = async (status: RespostaDisponibilidade) => {
    if (!playerId || aGravar) return
    setAGravar(true)
    try {
      await gravarDisponibilidadeAtleta(jogo.id, playerId, status)
      setMinhaResposta(status)
      setTodasRespostas(prev => ({ ...prev, [playerId]: status }))
    } finally {
      setAGravar(false)
    }
  }

  // Agrupar atletas por resposta
  const disponiveis = useMemo(() => {
    return atletas.filter(p => todasRespostas[p.id] === 'available')
  }, [atletas, todasRespostas])

  const indisponiveis = useMemo(() => {
    return atletas.filter(p => todasRespostas[p.id] === 'unavailable')
  }, [atletas, todasRespostas])

  const semResposta = useMemo(() => {
    return atletas.filter(p => !todasRespostas[p.id])
  }, [atletas, todasRespostas])

  // Atletas que eventualmente responderam mas não constam na lista filtrada
  const outrosDisponiveis = useMemo(() => {
    const idsJa = new Set(disponiveis.map(p => p.id))
    return Object.entries(todasRespostas)
      .filter(([id, st]) => st === 'available' && !idsJa.has(id))
      .map(([id]) => listaPlantel.find(p => p.id === id) || ({ id, name: 'Atleta' } as Profile))
  }, [todasRespostas, disponiveis, listaPlantel])

  const outrosIndisponiveis = useMemo(() => {
    const idsJa = new Set(indisponiveis.map(p => p.id))
    return Object.entries(todasRespostas)
      .filter(([id, st]) => st === 'unavailable' && !idsJa.has(id))
      .map(([id]) => listaPlantel.find(p => p.id === id) || ({ id, name: 'Atleta' } as Profile))
  }, [todasRespostas, indisponiveis, listaPlantel])

  const todosDisponiveis = useMemo(() => [...disponiveis, ...outrosDisponiveis], [disponiveis, outrosDisponiveis])
  const todosIndisponiveis = useMemo(() => [...indisponiveis, ...outrosIndisponiveis], [indisponiveis, outrosIndisponiveis])

  const totalRespostas = todosDisponiveis.length + todosIndisponiveis.length

  if (compacto) {
    return (
      <div className="mt-3 p-3 rounded-2xl bg-csc-gold/10 border border-csc-gold/30 text-white space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy size={14} className="text-csc-gold shrink-0" />
            <span className="font-display font-extrabold text-[11px] text-csc-gold uppercase tracking-wider truncate">
              Sondagem Pré-Jogo
            </span>
          </div>
          {isCoachOrAdmin ? (
            <span className="font-display font-bold text-[10.5px] text-emerald-400 shrink-0">
              {todosDisponiveis.length} disp. · {todosIndisponiveis.length} indisp. · {semResposta.length} sem resp.
            </span>
          ) : minhaResposta === 'available' ? (
            <span className="text-[10px] font-bold text-csc-verde-texto flex items-center gap-1">
              <CheckCircle2 size={12} /> Disponível
            </span>
          ) : minhaResposta === 'unavailable' ? (
            <span className="text-[10px] font-bold text-csc-vermelho-texto flex items-center gap-1">
              <XCircle size={12} /> Indisponível
            </span>
          ) : (
            <span className="text-[10px] text-white/50 italic">Pendente</span>
          )}
        </div>

        {playerId && !minhaResposta && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={aGravar}
              onClick={e => {
                e.stopPropagation()
                responder('available')
              }}
              className="flex-1 h-8 rounded-xl font-display font-bold text-[11px] bg-csc-light text-csc-tinta hover:bg-csc-light/90 flex items-center justify-center gap-1 cursor-pointer"
            >
              <CheckCircle2 size={12} />
              Estou Disponível
            </button>
            <button
              type="button"
              disabled={aGravar}
              onClick={e => {
                e.stopPropagation()
                responder('unavailable')
              }}
              className="flex-1 h-8 rounded-xl font-display font-bold text-[11px] bg-white/10 text-white hover:bg-white/15 flex items-center justify-center gap-1 cursor-pointer"
            >
              <XCircle size={12} />
              Não Posso
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-csc-gold/30 bg-csc-superficie overflow-hidden shadow-md my-3.5 text-white">
      {/* Cabeçalho */}
      <div className="px-4 py-3 bg-csc-gold/15 border-b border-csc-gold/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-csc-gold/25 text-csc-gold flex items-center justify-center shrink-0">
            <Trophy size={15} />
          </div>
          <div className="min-w-0">
            <h4 className="font-display font-black text-xs uppercase tracking-wider text-csc-gold truncate">
              Sondagem Pré-Jogo
            </h4>
            <p className="text-[10px] text-white/70 truncate">
              Disponibilidade manifestada pelos atletas para este jogo
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-csc-gold shrink-0">
          {totalRespostas} {totalRespostas === 1 ? 'resposta' : 'respostas'}
        </span>
      </div>

      <div className="p-3.5 space-y-3.5">
        {/* Bloco do próprio atleta (se aplicável) */}
        {playerId && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/8 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-bold text-white/90 flex items-center gap-1.5">
                <UserCheck size={14} className="text-csc-gold" />
                A tua disponibilidade
              </span>
              {minhaResposta === 'available' ? (
                <span className="text-[10.5px] font-bold text-csc-verde-texto flex items-center gap-1">
                  <CheckCircle2 size={13} /> Marcaste Disponível
                </span>
              ) : minhaResposta === 'unavailable' ? (
                <span className="text-[10.5px] font-bold text-csc-vermelho-texto flex items-center gap-1">
                  <XCircle size={13} /> Marcaste Indisponível
                </span>
              ) : (
                <span className="text-[10.5px] text-white/50 italic flex items-center gap-1">
                  <AlertCircle size={12} /> Por indicar
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={aGravar}
                onClick={() => responder('available')}
                className={`flex-1 h-9 rounded-xl font-display font-bold text-xs cursor-pointer
                  flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                    minhaResposta === 'available'
                      ? 'bg-csc-light text-csc-tinta shadow-sm font-black'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
              >
                {minhaResposta === 'available' && <CheckCircle2 size={13} />}
                Estou Disponível
              </button>

              <button
                type="button"
                disabled={aGravar}
                onClick={() => responder('unavailable')}
                className={`flex-1 h-9 rounded-xl font-display font-bold text-xs cursor-pointer
                  flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                    minhaResposta === 'unavailable'
                      ? 'bg-white/90 text-csc-tinta shadow-sm font-black'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
              >
                {minhaResposta === 'unavailable' && <XCircle size={13} />}
                Não Posso Ir
              </button>
            </div>
          </div>
        )}

        {/* Resumo da equipa (apenas para treinadores e direção) */}
        {isCoachOrAdmin && (
          <div className="space-y-3 pt-1 border-t border-white/10">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <div className="font-display font-black text-lg text-emerald-400">
                  {todosDisponiveis.length}
                </div>
                <div className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-wider">
                  Disponíveis
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <div className="font-display font-black text-lg text-rose-400">
                  {todosIndisponiveis.length}
                </div>
                <div className="text-[10px] font-bold text-rose-300/80 uppercase tracking-wider">
                  Indisponíveis
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="font-display font-black text-lg text-white/70">
                  {semResposta.length}
                </div>
                <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                  Sem Resposta
                </div>
              </div>
            </div>

            {/* Botão de alternar lista discriminada */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light')
                setAMostrarLista(v => !v)
              }}
              className="w-full py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/8 text-csc-gold font-display font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Users size={14} />
                {aMostrarLista ? 'Ocultar detalhes dos atletas' : 'Ver respostas por atleta'}
              </span>
              {aMostrarLista ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Lista discriminada de atletas */}
            {aMostrarLista && (
              <div className="pt-2 border-t border-white/10 space-y-3">
                {/* Disponíveis */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Disponíveis ({todosDisponiveis.length})
                  </p>
                  {todosDisponiveis.length === 0 ? (
                    <p className="text-[11px] text-white/40 italic px-2">Nenhum atleta indicou disponibilidade ainda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {todosDisponiveis.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium"
                        >
                          <span className="font-bold font-display text-[9px] opacity-75">{p.jersey_number ?? '–'}</span>
                          <span>{getPlayerDisplayName(p)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Indisponíveis */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-400 mb-1 flex items-center gap-1">
                    <XCircle size={12} />
                    Indisponíveis ({todosIndisponiveis.length})
                  </p>
                  {todosIndisponiveis.length === 0 ? (
                    <p className="text-[11px] text-white/40 italic px-2">Nenhum atleta indicou indisponibilidade.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {todosIndisponiveis.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-medium"
                        >
                          <span className="font-bold font-display text-[9px] opacity-75">{p.jersey_number ?? '–'}</span>
                          <span>{getPlayerDisplayName(p)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sem Resposta */}
                {semResposta.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                      Sem Resposta ({semResposta.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {semResposta.map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[11px]"
                        >
                          <span className="font-display text-[9px] opacity-60">{p.jersey_number ?? '–'}</span>
                          <span>{getPlayerDisplayName(p)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ação rápida para o treinador */}
            {aoEditarConvocatoria && (
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={aoEditarConvocatoria}
                  className="w-full py-2 px-3 rounded-xl bg-csc-gold/15 hover:bg-csc-gold/25 border border-csc-gold/30 text-csc-gold font-display font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trophy size={13} />
                  Gerir Convocatória do Jogo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
