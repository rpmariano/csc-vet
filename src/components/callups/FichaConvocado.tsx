import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Trash2, Phone, MessageCircle, ChevronRight, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { BottomSheet } from '../BottomSheet'
import { EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

/**
 * Ficha rápida de um convocado (ecrã 4a).
 *
 * Abre por cima da convocatória, ao tocar na linha do atleta. É o ecrã de uso
 * diário de quem convoca: quem é, o que respondeu, como se lhe liga, e as
 * mesmas quatro ações da linha — em botões com nome, e não só em ícones de
 * 44px que é preciso adivinhar.
 *
 * **O vocabulário é o da resposta e não o da presença.** Esta app não marca
 * presenças: a tabela `attendances` existe e nunca é escrita. O que há é a
 * resposta à convocatória, e o handoff original — "Confirmou presença",
 * "PRESENÇAS: P P F P P" — descrevia uma coisa que não acontece. O bloco de
 * histórico conta convocatórias respondidas, e diz em letra pequena que as por
 * responder não são falta de ninguém.
 *
 * **O estado vazio é a norma.** Em produção há 1191 convocatórias por responder
 * para 9 respostas: o normal, ao abrir esta ficha, é não haver histórico
 * nenhum. É por isso que o bloco diz "1 de 34 convocatórias" e não uma
 * percentagem — a percentagem de uma resposta é 100%, e não significa nada.
 *
 * **Não vai no endereço**, ao contrário do detalhe do evento e da ficha de
 * atleta. É filho de uma persiana que já está no endereço (`?event=`,
 * `?convocatoria=`): um `?convocado=` sozinho não abriria nada, e empilhar dois
 * detalhes com endereço agravava a falha do retroceder do ponto 6 dos riscos.
 */

export interface ConvocadoDaTira {
  id: string
  status: 'called' | 'confirmed' | 'declined' | 'pending'
  responded_at?: string | null
  player?: {
    id?: string | null
    name?: string | null
    jersey_number?: number | null
    position?: string | null
    status?: string | null
  } | null
}

interface FichaConvocadoProps {
  /** A convocatória aberta. `null` fecha a persiana. */
  convocatoria: ConvocadoDaTira | null
  /** Toda a convocatória do evento, para a tira do topo. */
  tira: ConvocadoDaTira[]
  displayName: string
  aoEscolher: (convocatoriaId: string) => void
  aoFechar: () => void
  aoConfirmar: () => void
  aoRecusar: () => void
  aoRemover: () => void
}

const ESTADO_ATLETA: Record<string, { texto: string; classe: string }> = {
  active: { texto: 'Apto', classe: 'bg-csc-light/16 border-csc-light/30 text-csc-verde-texto' },
  injured: { texto: 'Lesionado', classe: 'bg-csc-red/12 border-csc-red/28 text-csc-vermelho-texto' },
  inactive: { texto: 'Inativo', classe: 'bg-white/8 border-white/14 text-white/62' },
}

/**
 * "ontem, 21:14" · "12 set, 09:03" · "" quando não se sabe a hora.
 *
 * Devolver vazio é o caso corrente e não um erro: `callups.responded_at` só
 * existe desde setembro de 2026, e as nove respostas anteriores ficaram sem
 * hora porque não havia como a saber.
 */
function quandoRespondeu(iso: string | null | undefined): string {
  if (!iso) return ''
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return ''

  const horas = quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  const hoje = new Date()
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (mesmoDia(quando, hoje)) return 'hoje, ' + horas
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  if (mesmoDia(quando, ontem)) return 'ontem, ' + horas

  return quando.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) + ', ' + horas
}

interface HistoricoDoAtleta {
  total: number
  respostas: ('confirmed' | 'declined')[]
  amarelos: number
  vermelhos: number
  suspenso: boolean
  telefone: string | null
}

export const FichaConvocado: React.FC<FichaConvocadoProps> = ({
  convocatoria,
  tira,
  displayName,
  aoEscolher,
  aoFechar,
  aoConfirmar,
  aoRecusar,
  aoRemover,
}) => {
  const jogadorId = convocatoria?.player?.id ?? null
  const [historico, setHistorico] = useState<HistoricoDoAtleta | null>(null)

  useEffect(() => {
    if (!jogadorId) {
      setHistorico(null)
      return
    }
    let cancelado = false
    setHistorico(null)

    const carregar = async () => {
      /*
        O telefone vem de `profiles` e não da vista do plantel: `v_players_public`
        não o tem, de propósito. Só a equipa técnica e o próprio leem `profiles`,
        por RLS — e esta ficha é de quem convoca, por isso a leitura passa. É
        também a razão por que este componente não serve para o jogador comum:
        a consulta devolveria vazio.
      */
      const [convocatorias, disciplina, suspensoes, ficha] = await Promise.all([
        supabase
          .from('callups')
          .select('status, event:events!inner(date_time)')
          .eq('player_id', jogadorId)
          .lte('event.date_time', new Date().toISOString()),
        supabase.from('stats').select('yellow_cards, red_cards').eq('player_id', jogadorId),
        supabase.from('tournament_suspensions').select('id').eq('player_id', jogadorId).eq('status', 'active'),
        supabase.from('profiles').select('phone').eq('id', jogadorId).maybeSingle(),
      ])

      if (cancelado) return

      const linhas = (convocatorias.data ?? []) as unknown as {
        status: string
        event: { date_time: string } | null
      }[]
      const cartoes = (disciplina.data ?? []) as { yellow_cards: number | null; red_cards: number | null }[]

      setHistorico({
        total: linhas.length,
        // As mais recentes primeiro: a ordenação por coluna da tabela ligada
        // não é fiável no PostgREST quando o filtro é `!inner`, e são poucas
        // linhas para valer a pena outra viagem ao servidor.
        respostas: linhas
          .filter(l => l.status === 'confirmed' || l.status === 'declined')
          .sort((a, b) => (b.event?.date_time ?? '').localeCompare(a.event?.date_time ?? ''))
          .map(l => l.status as 'confirmed' | 'declined'),
        amarelos: cartoes.reduce((t, c) => t + (c.yellow_cards ?? 0), 0),
        vermelhos: cartoes.reduce((t, c) => t + (c.red_cards ?? 0), 0),
        suspenso: (suspensoes.data ?? []).length > 0,
        telefone: (ficha.data as { phone?: string | null } | null)?.phone ?? null,
      })
    }

    carregar()
    return () => { cancelado = true }
  }, [jogadorId])

  const jogador = convocatoria?.player
  const posicoes = jogador?.position
    ? jogador.position.split(',').map(p => p.trim()).filter(Boolean)
    : []
  const estado = ESTADO_ATLETA[jogador?.status ?? 'active'] ?? ESTADO_ATLETA.active
  const confirmado = convocatoria?.status === 'confirmed'
  const recusou = convocatoria?.status === 'declined'
  const hora = quandoRespondeu(convocatoria?.responded_at)

  const telefoneLimpo = historico?.telefone ? historico.telefone.replace(/[^\d+]/g, '') : ''
  const porResponder = Math.max(
    0,
    Math.min(5, historico?.total ?? 0) - (historico?.respostas.length ?? 0),
  )

  return (
    <BottomSheet
      isOpen={Boolean(convocatoria)}
      onClose={aoFechar}
      title={displayName}
      description="Convocatória"
      ariaLabel={'Convocado: ' + displayName}
    >
      {convocatoria && (
        <div className="space-y-3">
          {/* A tira de convocados: saltar de atleta para atleta sem fechar. */}
          {tira.length > 1 && (
            <div
              className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
              role="group"
              aria-label="Outros convocados"
            >
              {tira.map(c => {
                const ativo = c.id === convocatoria.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { triggerHaptic('light'); aoEscolher(c.id) }}
                    aria-current={ativo ? 'true' : undefined}
                    aria-label={c.player?.name ?? 'Convocado'}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer
                      font-display font-extrabold text-[12px] border transition-transform duration-150 active:scale-97
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                        ativo
                          ? 'bg-csc-gold text-csc-tinta border-csc-gold'
                          : 'bg-white/6 text-white/60 border-white/12'
                      }`}
                  >
                    {c.player?.jersey_number ?? '–'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Identidade */}
          <div className="cartao-simples flex items-center gap-3 px-4 py-3.5">
            <span
              className="w-11 h-11 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 flex items-center
                justify-center font-display font-extrabold text-[15px] text-csc-gold flex-none"
            >
              {jogador?.jersey_number ?? '–'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-display font-extrabold text-[15px] text-white truncate">
                {jogador?.name || displayName}
              </span>
              {posicoes.length > 0 && (
                <span className="block text-[10.5px] text-white/62 mt-0.5 truncate">{posicoes.join(' · ')}</span>
              )}
            </span>
            <span
              className={`font-display font-bold text-[9.5px] px-2.5 py-1 rounded-[9px] border flex-none ${estado.classe}`}
            >
              {estado.texto}
            </span>
          </div>

          {/* A resposta. A hora só aparece quando se sabe. */}
          <div
            className={`cartao-simples flex items-center gap-3 px-4 py-3.5 ${
              confirmado
                ? 'bg-csc-light/12 border-csc-light/28'
                : recusou
                  ? 'bg-csc-red/10 border-csc-red/25'
                  : ''
            }`}
          >
            {confirmado ? (
              <CheckCircle2 size={18} className="text-csc-verde-texto flex-none" />
            ) : recusou ? (
              <XCircle size={18} className="text-csc-vermelho-texto flex-none" />
            ) : (
              <span className="w-[18px] h-[18px] rounded-full border-2 border-dashed border-white/30 flex-none" />
            )}
            <span className="flex-1 font-display font-bold text-[12.5px] text-white">
              {confirmado ? 'Disse que sim' : recusou ? 'Disse que não' : 'Ainda não respondeu'}
            </span>
            {hora && <span className="text-[10.5px] text-white/62 flex-none">{hora}</span>}
          </div>

          {/* Respostas anteriores. As por responder ficam a tracejado. */}
          <div className="cartao-simples px-4 py-3.5">
            <div className="flex items-baseline gap-2">
              <EtiquetaSeccao como="p" className="flex-1">Respostas anteriores</EtiquetaSeccao>
              <span className="text-[10px] text-white/62 flex-none">
                {historico
                  ? `${historico.respostas.length} de ${historico.total} ${
                      historico.total === 1 ? 'convocatória' : 'convocatórias'
                    }`
                  : '…'}
              </span>
            </div>

            {historico && historico.total === 0 ? (
              <p className="text-[11px] text-white/62 mt-2.5">
                Ainda não foi convocado para nenhum evento passado.
              </p>
            ) : (
              <div className="flex items-center gap-2.5 mt-3">
                <span className="flex gap-1.5 flex-none">
                  {(historico?.respostas ?? []).slice(0, 5).map((r, i) => (
                    <span
                      key={i}
                      className={`w-5 h-5 rounded-md font-display font-bold text-[9px] leading-5 text-center ${
                        r === 'confirmed'
                          ? 'bg-csc-light/32 text-csc-verde-texto'
                          : 'bg-csc-red/25 text-csc-vermelho-texto'
                      }`}
                    >
                      {r === 'confirmed' ? 'S' : 'N'}
                      <span className="sr-only">
                        {r === 'confirmed' ? ' — disse que sim' : ' — disse que não'}
                      </span>
                    </span>
                  ))}
                  {Array.from({ length: porResponder }).map((_, i) => (
                    <span
                      key={'vazio-' + i}
                      className="w-5 h-5 rounded-md bg-white/5 border border-dashed border-white/16"
                    >
                      <span className="sr-only">por responder</span>
                    </span>
                  ))}
                </span>
                <span className="flex-1 text-[10px] leading-snug text-white/62 text-right">
                  as convocatórias por responder não contam como falta
                </span>
              </div>
            )}
          </div>

          {/* Disciplina numa linha: dois números e uma frase. */}
          <div className="cartao-simples flex items-center gap-3 px-4 py-3.5">
            <EtiquetaSeccao como="p" className="flex-none">Disciplina</EtiquetaSeccao>
            <span className="flex items-center gap-1.5 flex-none">
              <span className="w-[11px] h-[15px] rounded-[2px] bg-csc-gold" aria-hidden="true" />
              <span className="font-display font-extrabold text-sm text-white tabular-nums">
                {historico?.amarelos ?? '–'}
              </span>
              <span className="sr-only">cartões amarelos</span>
            </span>
            <span className="flex items-center gap-1.5 flex-none">
              <span className="w-[11px] h-[15px] rounded-[2px] bg-csc-red" aria-hidden="true" />
              <span className="font-display font-extrabold text-sm text-white tabular-nums">
                {historico?.vermelhos ?? '–'}
              </span>
              <span className="sr-only">cartões vermelhos</span>
            </span>
            <span
              className={`flex-1 text-[10.5px] text-right ${
                historico?.suspenso ? 'text-csc-vermelho-texto font-bold' : 'text-white/62'
              }`}
            >
              {historico?.suspenso ? (
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <ShieldAlert size={13} /> suspenso
                </span>
              ) : (
                'sem suspensão'
              )}
            </span>
          </div>

          {/* Contacto. Sem telefone na ficha, o bloco não aparece de todo. */}
          {historico?.telefone && (
            <div className="cartao-simples flex items-center gap-2 px-4 py-3">
              <span className="flex-1 min-w-0 font-display font-bold text-[13px] text-white truncate">
                {historico.telefone}
              </span>
              <a
                href={'tel:' + telefoneLimpo}
                onClick={() => triggerHaptic('light')}
                className="h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/15 text-white
                  font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <Phone size={13} /> Ligar
              </a>
              <a
                href={'https://wa.me/' + telefoneLimpo.replace(/^\+/, '')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => triggerHaptic('light')}
                className="h-11 px-3.5 rounded-[18px] bg-csc-light/16 border border-csc-light/30 text-csc-verde-texto
                  font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            </div>
          )}

          {/* As ações: as mesmas da linha, com nome em vez de só ícone. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { triggerHaptic('success'); aoConfirmar() }}
              aria-pressed={confirmado}
              className={`flex-1 h-12 rounded-3xl border font-display font-extrabold text-[12.5px] cursor-pointer
                flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                  confirmado ? 'bg-csc-light border-csc-light text-white' : 'bg-white/9 border-white/20 text-white'
                }`}
            >
              <CheckCircle2 size={15} /> Confirmado
            </button>
            <button
              type="button"
              onClick={() => { triggerHaptic('warning'); aoRecusar() }}
              aria-pressed={recusou}
              className={`flex-1 h-12 rounded-3xl border font-display font-extrabold text-[12.5px] cursor-pointer
                flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                  recusou ? 'bg-csc-red border-csc-red text-white' : 'bg-white/9 border-white/20 text-white'
                }`}
            >
              <XCircle size={15} /> Recusou
            </button>
          </div>

          <button
            type="button"
            onClick={() => { triggerHaptic('warning'); aoRemover() }}
            className="w-full h-12 rounded-3xl bg-csc-red/15 border border-csc-red/35 text-csc-vermelho-texto
              font-display font-extrabold text-[12.5px] cursor-pointer flex items-center justify-center gap-2
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <Trash2 size={15} /> Remover da convocatória
          </button>

          {/* A ficha a sério — posições, contactos, documentos — é a do
              Plantel, que já existe e já tem endereço próprio. */}
          {jogadorId && (
            <Link
              to={'/team-management?atleta=' + jogadorId}
              onClick={() => { triggerHaptic('light'); aoFechar() }}
              className="cartao-simples min-h-12 flex items-center gap-3 px-4 py-3 cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <span className="flex-1 font-display font-extrabold text-[12.5px] text-white">
                Abrir ficha completa
              </span>
              <ChevronRight size={16} className="text-white/35 flex-none" />
            </Link>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

export default FichaConvocado
