import React, { useState, useMemo } from 'react'
import {
  Vote,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  Award,
} from 'lucide-react'
import type { EleitorMvpInfo } from '../../lib/mvp'
import { triggerHaptic } from '../../utils/haptics'

interface SecaoEleitoresMvpProps {
  eleitores: EleitorMvpInfo[]
  currentUserId?: string
  onVotarClick?: () => void
}

type FiltroVoto = 'todos' | 'pendentes' | 'votaram'

export const SecaoEleitoresMvp: React.FC<SecaoEleitoresMvpProps> = ({
  eleitores,
  currentUserId,
  onVotarClick,
}) => {
  const [expandido, setExpandido] = useState(true)
  const [filtro, setFiltro] = useState<FiltroVoto>('todos')

  const total = eleitores.length
  const votaram = useMemo(() => eleitores.filter(e => e.jaVotou).length, [eleitores])
  const pendentes = total - votaram
  const percentagem = total > 0 ? Math.round((votaram / total) * 100) : 0

  const eleitoresFiltrados = useMemo(() => {
    let lista = [...eleitores]
    if (filtro === 'pendentes') {
      lista = lista.filter(e => !e.jaVotou)
    } else if (filtro === 'votaram') {
      lista = lista.filter(e => e.jaVotou)
    }

    // Se o próprio utilizador estiver na lista, dar prioridade no topo para fácil visibilidade
    if (currentUserId) {
      lista.sort((a, b) => {
        if (a.id === currentUserId) return -1
        if (b.id === currentUserId) return 1
        return 0
      })
    }

    return lista
  }, [eleitores, filtro, currentUserId])

  const euPendente = useMemo(() => {
    return eleitores.some(e => e.id === currentUserId && !e.jaVotou)
  }, [eleitores, currentUserId])

  if (total === 0) return null

  return (
    <div className="bg-white/[0.07] rounded-2xl border border-white/15 overflow-hidden shadow-lg shadow-black/20">
      {/* Cabeçalho da Secção com Sumário de Progresso */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light')
          setExpandido(prev => !prev)
        }}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
        aria-expanded={expandido}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold border border-csc-gold/40 flex items-center justify-center shrink-0">
            <Vote size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-display font-black text-sm text-white truncate">
                Quem tem de Votar no MVP
              </h4>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/15">
                {votaram}/{total}
              </span>
            </div>
            <p className="text-[11px] text-white/60 truncate mt-0.5">
              Convocados e equipa técnica · {percentagem}% já votaram
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {euPendente && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-csc-gold text-csc-tinta shadow-sm animate-pulse">
              O teu voto está pendente!
            </span>
          )}
          <span className="text-white/60 p-1">
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>
      </button>

      {/* Barra de Progresso Visual */}
      <div className="px-4 pb-3">
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              percentagem === 100
                ? 'bg-csc-verde-texto'
                : percentagem >= 50
                ? 'bg-csc-gold'
                : 'bg-amber-400'
            }`}
            style={{ width: `${percentagem}%` }}
          />
        </div>
      </div>

      {expandido && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/10">
          {/* Alerta se o próprio utilizador ainda não votou */}
          {euPendente && onVotarClick && (
            <div className="p-3 rounded-xl bg-csc-gold/15 border border-csc-gold/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Award size={16} className="text-csc-gold shrink-0" />
                <p className="text-xs text-white font-semibold">
                  Ainda não votaste nos 2 melhores deste jogo!
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium')
                  onVotarClick()
                }}
                className="px-3 py-1 rounded-lg bg-csc-gold text-csc-tinta font-display font-black text-xs hover:bg-csc-gold/90 transition-all shrink-0 cursor-pointer active:scale-97 shadow-sm"
              >
                Votar agora
              </button>
            </div>
          )}

          {/* Filtros em Pílulas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light')
                setFiltro('todos')
              }}
              className={`px-3 py-1 rounded-xl text-xs font-display font-extrabold transition-all cursor-pointer ${
                filtro === 'todos'
                  ? 'bg-white/20 text-white border border-white/30 shadow-xs'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              Todos ({total})
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light')
                setFiltro('pendentes')
              }}
              className={`px-3 py-1 rounded-xl text-xs font-display font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                filtro === 'pendentes'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Clock size={12} className={filtro === 'pendentes' ? 'text-amber-300' : 'text-white/50'} />
              <span>Pendentes ({pendentes})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light')
                setFiltro('votaram')
              }}
              className={`px-3 py-1 rounded-xl text-xs font-display font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                filtro === 'votaram'
                  ? 'bg-csc-verde-suave/25 text-csc-verde-texto border border-csc-verde-suave/40 shadow-xs'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Check size={12} strokeWidth={2.5} className={filtro === 'votaram' ? 'text-csc-verde-texto' : 'text-white/50'} />
              <span>Já Votaram ({votaram})</span>
            </button>
          </div>

          {/* Lista de Votantes */}
          {eleitoresFiltrados.length === 0 ? (
            <div className="py-6 text-center text-xs text-white/50 italic bg-white/[0.02] rounded-xl border border-white/5">
              {filtro === 'pendentes'
                ? 'Excelente! Todos os convocados e equipa técnica já votaram.'
                : 'Ainda não foram registados votos.'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {eleitoresFiltrados.map(e => {
                const souEu = e.id === currentUserId
                const displayName = e.shirt_name || e.name

                return (
                  <div
                    key={e.id}
                    className={`p-2.5 rounded-xl flex items-center justify-between gap-3 border transition-colors ${
                      souEu
                        ? 'bg-csc-gold/10 border-csc-gold/30'
                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* Identificação do votante */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {e.categoria === 'jogador' ? (
                        <span className="w-7 h-7 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 text-xs font-display font-black flex items-center justify-center shrink-0 shadow-xs">
                          {e.jersey_number || '—'}
                        </span>
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-csc-blue/20 text-csc-azul-texto border border-csc-blue/40 text-xs flex items-center justify-center shrink-0">
                          <Shield size={14} />
                        </span>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-white truncate">
                            {displayName}
                          </p>
                          {souEu && (
                            <span className="text-[10px] font-extrabold text-csc-gold bg-csc-gold/20 px-1.5 py-0.2 rounded">
                              Tu
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded ${
                              e.funcao.includes('Titular')
                                ? 'bg-csc-gold/15 text-csc-gold'
                                : e.funcao.includes('Suplente')
                                ? 'bg-csc-blue/15 text-csc-azul-texto'
                                : e.funcao.includes('Treinador')
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : e.funcao.includes('Direção')
                                ? 'bg-purple-500/15 text-purple-300'
                                : 'bg-white/10 text-white/70'
                            }`}
                          >
                            {e.funcao}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Estado do Voto */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      {e.jaVotou ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-csc-verde-suave/20 text-csc-verde-texto border border-csc-verde-suave/30">
                          <Check size={12} strokeWidth={2.5} />
                          <span>Votou</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Clock size={12} strokeWidth={2} />
                            <span>Pendente</span>
                          </span>
                          {souEu && onVotarClick && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('medium')
                                onVotarClick()
                              }}
                              className="px-2 py-0.5 rounded-lg bg-csc-gold text-csc-tinta text-[10px] font-black hover:bg-csc-gold/90 transition-all cursor-pointer active:scale-95"
                            >
                              Votar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
