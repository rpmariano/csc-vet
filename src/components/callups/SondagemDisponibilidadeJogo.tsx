import React, { useEffect, useState } from 'react'
import { Trophy, Clock, MapPin, CheckCircle2, XCircle, Users, ChevronDown, ChevronUp } from 'lucide-react'
import type { EventoComDataETipo, RespostaDisponibilidade } from '../../lib/disponibilidadeJogo'
import {
  obterDisponibilidadeAtleta,
  obterTodasDisponibilidadesDoJogo,
  gravarDisponibilidadeAtleta,
} from '../../lib/disponibilidadeJogo'
import { localDoEvento } from '../../lib/eventos'
import type { Profile } from '../../context/AuthContext'
import { getPlayerDisplayName } from '../../lib/eventos'
import { eAdepto } from '../../lib/papeis'
import { CLUBE_SIGLA } from '../../lib/clube'
import { triggerHaptic } from '../../utils/haptics'

export interface SondagemDisponibilidadeJogoProps {
  jogo: EventoComDataETipo
  playerId: string
  campos?: readonly { id: string; name: string; address?: string | null }[]
  clubeSigla?: string
  compacto?: boolean
  isCoachOrAdmin?: boolean
  plantel?: readonly Profile[]
  aoResponder?: (status: RespostaDisponibilidade) => void
}

export const SondagemDisponibilidadeJogo: React.FC<SondagemDisponibilidadeJogoProps> = ({
  jogo,
  playerId,
  campos = [],
  clubeSigla = CLUBE_SIGLA,
  compacto = false,
  isCoachOrAdmin = false,
  plantel = [],
  aoResponder,
}) => {
  const [minhaResposta, setMinhaResposta] = useState<RespostaDisponibilidade | null>(null)
  const [todasRespostas, setTodasRespostas] = useState<Record<string, RespostaDisponibilidade>>({})
  const [aGravar, setAGravar] = useState(false)
  const [aMostrarEquipa, setAMostrarEquipa] = useState(false)

  // Carregar disponibilidade deste atleta e do jogo
  useEffect(() => {
    let ativo = true
    if (playerId && jogo?.id) {
      obterDisponibilidadeAtleta(jogo.id, playerId).then(res => {
        if (ativo) setMinhaResposta(res)
      })

      if (isCoachOrAdmin) {
        obterTodasDisponibilidadesDoJogo(jogo.id).then(res => {
          if (ativo) setTodasRespostas(res)
        })
      }
    }

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

    return () => {
      ativo = false
      window.removeEventListener('csc_match_availability_updated', handleAtualizacao)
    }
  }, [jogo?.id, playerId, isCoachOrAdmin])

  const responder = async (status: RespostaDisponibilidade) => {
    if (aGravar) return
    setAGravar(true)
    try {
      await gravarDisponibilidadeAtleta(jogo.id, playerId, status)
      setMinhaResposta(status)
      if (isCoachOrAdmin) {
        setTodasRespostas(prev => ({ ...prev, [playerId]: status }))
      }
      aoResponder?.(status)
    } finally {
      setAGravar(false)
    }
  }

  const dJogo = new Date(jogo.date_time)
  const dataFormatada = dJogo.toLocaleDateString('pt-PT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const horaFormatada = dJogo.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

  const oppNome = jogo.opponent?.initials || jogo.opponent?.name || 'Adversário'
  const confronto = jogo.home_away === 'away' ? `${oppNome} vs ${clubeSigla}` : `${clubeSigla} vs ${oppNome}`

  const { nome: localNome } = localDoEvento(jogo, campos)

  // Contagens para treinadores
  const listaValores = Object.values(todasRespostas)
  const contagemDisponiveis = listaValores.filter(s => s === 'available').length
  const contagemIndisponiveis = listaValores.filter(s => s === 'unavailable').length

  if (compacto) {
    return (
      <div className="mt-3 p-3 rounded-2xl bg-csc-gold/10 border border-csc-gold/30 text-white space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy size={14} className="text-csc-gold shrink-0" />
            <span className="font-display font-extrabold text-[11px] text-csc-gold uppercase tracking-wider truncate">
              Sondagem para o jogo · {confronto}
            </span>
          </div>
          <span className="font-display font-bold text-[10.5px] text-white/70 shrink-0">
            {dataFormatada}, {horaFormatada}
          </span>
        </div>

        <p className="text-[11.5px] text-white/90 font-medium">
          Estás disponível para ser convocado para este jogo?
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={aGravar}
            onClick={e => {
              e.stopPropagation()
              responder('available')
            }}
            className={`flex-1 h-9 rounded-xl font-display font-bold text-[11.5px] cursor-pointer
              flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                minhaResposta === 'available'
                  ? 'bg-csc-light text-csc-tinta shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
          >
            {minhaResposta === 'available' && <CheckCircle2 size={13} />}
            Disponível
          </button>
          <button
            type="button"
            disabled={aGravar}
            onClick={e => {
              e.stopPropagation()
              responder('unavailable')
            }}
            className={`flex-1 h-9 rounded-xl font-display font-bold text-[11.5px] cursor-pointer
              flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                minhaResposta === 'unavailable'
                  ? 'bg-white/90 text-csc-tinta shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
          >
            {minhaResposta === 'unavailable' && <XCircle size={13} />}
            Indisponível
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg shadow-black/25 border border-csc-gold/35 bg-csc-superficie text-white">
      {/* Cabeçalho da Sondagem Acoplada */}
      <div className="bg-csc-gold/14 px-4 py-3 border-b border-csc-gold/25 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <Trophy size={15} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-black text-[9.5px] uppercase tracking-[0.14em] text-csc-gold">
              Sondagem acoplada ao treino
            </p>
            <h4 className="font-display font-extrabold text-[13.5px] text-white truncate">
              {confronto}
            </h4>
          </div>
        </div>

        <span className="font-display font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-csc-gold/20 text-csc-gold shrink-0">
          Jogo
        </span>
      </div>

      {/* Detalhes do Jogo (Data, Hora, Concentração, Local) */}
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/8">
            <Clock size={14} className="text-csc-gold shrink-0" />
            <span className="truncate">
              <strong className="text-white">{dataFormatada}</strong> às {horaFormatada}
              {jogo.meeting_time ? ` (Conc. ${jogo.meeting_time.substring(0, 5)})` : ''}
            </span>
          </div>

          {localNome && (
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/8">
              <MapPin size={14} className="text-csc-gold shrink-0" />
              <span className="text-white/85 truncate" title={localNome}>
                {localNome}
              </span>
            </div>
          )}
        </div>

        {/* Questão de Disponibilidade */}
        <div className="pt-1">
          <p className="font-display font-extrabold text-[13px] text-white leading-snug">
            Estás disponível para ser convocado para este jogo?
          </p>
          <p className="text-[10.5px] text-white/65 mt-0.5 leading-relaxed">
            Informa a equipa técnica da tua disponibilidade antes de ser elaborada a convocatória oficial do jogo.
          </p>
        </div>

        {/* Botões de Resposta do Atleta */}
        <div className="flex gap-2.5 pt-0.5">
          <button
            type="button"
            disabled={aGravar}
            onClick={() => responder('available')}
            className={`flex-1 min-h-11 px-4 rounded-[22px] font-display font-bold text-[12.5px] cursor-pointer
              flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                minhaResposta === 'available'
                  ? 'bg-csc-light text-csc-tinta shadow-md font-extrabold'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
          >
            {minhaResposta === 'available' && <CheckCircle2 size={15} />}
            Sim, disponível
          </button>

          <button
            type="button"
            disabled={aGravar}
            onClick={() => responder('unavailable')}
            className={`flex-1 min-h-11 px-4 rounded-[22px] font-display font-bold text-[12.5px] cursor-pointer
              flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                minhaResposta === 'unavailable'
                  ? 'bg-white/90 text-csc-tinta shadow-md font-extrabold'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
          >
            {minhaResposta === 'unavailable' && <XCircle size={15} />}
            Não disponível
          </button>
        </div>

        {/* Indicador de Resposta Pessoal */}
        <div className="flex items-center justify-between text-[11px] pt-1">
          {minhaResposta === 'available' ? (
            <span className="text-csc-verde-texto font-bold flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Marcaste presença como disponível para o jogo
            </span>
          ) : minhaResposta === 'unavailable' ? (
            <span className="text-csc-vermelho-texto font-bold flex items-center gap-1.5">
              <XCircle size={13} />
              Marcaste que não estás disponível para o jogo
            </span>
          ) : (
            <span className="text-white/55 italic">
              Ainda não indicaste a tua disponibilidade para este jogo.
            </span>
          )}
        </div>

        {/* Resumo da equipa para treinadores/admins */}
        {isCoachOrAdmin && listaValores.length > 0 && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light')
                setAMostrarEquipa(v => !v)
              }}
              className="w-full flex items-center justify-between text-[11.5px] font-bold text-csc-gold hover:underline cursor-pointer py-1"
            >
              <span className="flex items-center gap-1.5">
                <Users size={14} />
                Respostas da equipa ({contagemDisponiveis} disponíveis · {contagemIndisponiveis} indisponíveis)
              </span>
              {aMostrarEquipa ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {aMostrarEquipa && (
              <div className="pt-2 border-t border-white/10 space-y-2.5">
                {/* Disponíveis */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    Disponíveis ({contagemDisponiveis})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plantel.filter(p => !eAdepto(p) && todasRespostas[p.id] === 'available').map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-medium"
                      >
                        <span className="font-bold text-[9px] opacity-75">{p.jersey_number ?? '–'}</span>
                        <span>{getPlayerDisplayName(p)}</span>
                      </span>
                    ))}
                    {contagemDisponiveis === 0 && (
                      <span className="text-[10.5px] text-white/40 italic">Nenhum atleta</span>
                    )}
                  </div>
                </div>

                {/* Indisponíveis */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-400 mb-1 flex items-center gap-1">
                    <XCircle size={11} />
                    Indisponíveis ({contagemIndisponiveis})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plantel.filter(p => !eAdepto(p) && todasRespostas[p.id] === 'unavailable').map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10.5px] font-medium"
                      >
                        <span className="font-bold text-[9px] opacity-75">{p.jersey_number ?? '–'}</span>
                        <span>{getPlayerDisplayName(p)}</span>
                      </span>
                    ))}
                    {contagemIndisponiveis === 0 && (
                      <span className="text-[10.5px] text-white/40 italic">Nenhum atleta</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
