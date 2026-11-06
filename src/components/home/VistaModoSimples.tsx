import React from 'react'
import {
  Wallet,
  CalendarCheck,
  Trophy,
  CheckCircle2,
  XCircle,
  MapPin,
  ExternalLink,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { CartaoSimples, CartaoVidro } from '../ui'
import { triggerHaptic } from '../../utils/haptics'
import { useEstadoPagamentos, type ItemPagamento } from '../../hooks/useEstadoPagamentos'
import { fmtEuro } from '../financeiro/estilos'
import { COMO_PAGAR } from '../SinalPagamentos'
import { obterEmblemaEfetivo } from '../../lib/sincronizarEquipas'
import { formatClubSigla } from '../../lib/siglas'
import { eAdepto } from '../../lib/papeis'
import type { JogoDaHome } from './CartaoProximoJogo'
import type { PendenteDaHome } from './PorResponder'
import type { ProvaDaHome } from './ProvasEmCurso'
import type { Profile } from '../../context/AuthContext'

export interface VistaModoSimplesProps {
  profile: Profile
  clubSettings: any
  jogos: JogoDaHome[]
  pendentes: PendenteDaHome[]
  provas: ProvaDaHome[]
  aoResponder: (id: string, status: 'confirmed' | 'declined') => void
  aoSairModoSimples: () => void
}

const DATA_LONGA = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const DIA_MES = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: 'short',
})

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

function quantoFalta(iso: string): string {
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((meiaNoite(new Date(iso)) - meiaNoite(new Date())) / 86400000)
  if (dias <= 0) return 'É hoje'
  if (dias === 1) return 'É amanhã'
  return `Em ${dias} dias`
}

function prazoPorExtenso(item: ItemPagamento): string {
  if (item.diasAteLimite === null) return 'sem prazo marcado'
  if (item.diasAteLimite < 0) {
    const dias = Math.abs(item.diasAteLimite)
    return dias === 1 ? 'venceu ontem' : `venceu há ${dias} dias`
  }
  if (item.diasAteLimite === 0) return 'vence hoje'
  if (item.diasAteLimite === 1) return 'vence amanhã'
  return `vence em ${item.diasAteLimite} dias`
}

export const VistaModoSimples: React.FC<VistaModoSimplesProps> = ({
  profile,
  clubSettings,
  jogos,
  pendentes,
  provas,
  aoResponder,
  aoSairModoSimples,
}) => {
  const utilizadorAdepto = eAdepto(profile)
  const estadoPagamentos = useEstadoPagamentos(profile, Boolean(profile?.id) && !utilizadorAdepto)

  const siglaClube = formatClubSigla(clubSettings?.initials)
  const emblemaClube = obterEmblemaEfetivo(clubSettings?.logo_url, 'Cascais', 'CSC') || '/csc-vet/cascais-emblem.png'

  // O primeiro jogo da lista é o próximo jogo
  const proximoJogo = jogos[0] || null

  /*
   * REGRA EXPLÍCITA:
   * "próximo jogo (se estiver por confirmar só aparece nesse bloco)"
   * O próximo jogo, caso esteja por confirmar, aparece APENAS no bloco do próximo jogo,
   * nunca duplicado no bloco de eventos para confirmar.
   */
  const eventosAConfirmar = pendentes.filter(p => !proximoJogo || p.id !== proximoJogo.id)

  const temDividas =
    !utilizadorAdepto &&
    (estadoPagamentos.emAtraso.length > 0 || estadoPagamentos.aVencer.length > 0)

  return (
    <div className="space-y-6 pt-1 pb-10">
      {/* =========================================================================
          1. BLOCO DE DÍVIDAS
         ========================================================================= */}
      <section aria-labelledby="seccao-dividas" className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <Wallet className="text-csc-gold" size={17} />
            <h2 id="seccao-dividas" className="font-display font-black text-sm uppercase tracking-wider text-white">
              Dívidas e Pagamentos
            </h2>
          </div>
          {temDividas && (
            <span
              className={`px-2 py-0.5 rounded-full font-display font-black text-[11px] ${
                estadoPagamentos.cor === 'vermelho'
                  ? 'bg-csc-red text-white'
                  : 'bg-csc-gold text-csc-tinta'
              }`}
            >
              {fmtEuro(estadoPagamentos.totalEmAviso)}
            </span>
          )}
        </div>

        {estadoPagamentos.loading ? (
          <CartaoSimples className="h-24 animate-pulse" />
        ) : temDividas ? (
          <CartaoSimples className="p-4 space-y-3.5 border-csc-red/40 bg-csc-red/10">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div>
                <p className="font-display font-extrabold text-[13px] text-white">
                  {estadoPagamentos.contador}{' '}
                  {estadoPagamentos.contador === 1 ? 'pagamento a regularizar' : 'pagamentos a regularizar'}
                </p>
                <p className="text-[10.5px] text-white/60">Quotas e encargos pendentes</p>
              </div>
              <span className="font-display font-black text-[18px] text-csc-vermelho-texto tabular-nums">
                {fmtEuro(estadoPagamentos.totalEmAviso)}
              </span>
            </div>

            <div className="space-y-2">
              {[...estadoPagamentos.emAtraso, ...estadoPagamentos.aVencer].map(item => {
                const emAtraso = item.estado === 'atraso'
                return (
                  <div
                    key={item.chave}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      emAtraso
                        ? 'bg-csc-red/15 border-csc-red/35'
                        : 'bg-csc-gold/15 border-csc-gold/35'
                    }`}
                  >
                    <span
                      className={`w-1 self-stretch rounded-full shrink-0 ${
                        emAtraso ? 'bg-csc-red' : 'bg-csc-gold'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-[12.5px] text-white truncate">
                        {item.etiqueta}
                      </p>
                      <p className="text-[10px] text-white/65 mt-0.5">
                        {item.categoria} · {prazoPorExtenso(item)}
                      </p>
                    </div>
                    <span
                      className={`font-display font-black text-[14px] tabular-nums shrink-0 ${
                        emAtraso ? 'text-csc-vermelho-texto' : 'text-csc-gold'
                      }`}
                    >
                      {fmtEuro(item.valor)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="pt-2 border-t border-white/10 text-[11px] leading-relaxed text-white/75 space-y-1">
              <p className="font-display font-bold text-[10px] text-csc-gold uppercase tracking-wider">
                Como Pagar
              </p>
              <p>{COMO_PAGAR}</p>
            </div>
          </CartaoSimples>
        ) : (
          <CartaoSimples className="p-4 flex items-center gap-3.5 bg-emerald-500/10 border-emerald-500/25">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="font-display font-extrabold text-[13px] text-white">Sem dívidas</p>
              <p className="text-[11px] text-white/65">
                Situação financeira em dia. Não tens quotas nem encargos pendentes.
              </p>
            </div>
          </CartaoSimples>
        )}
      </section>

      {/* =========================================================================
          2. BLOCO DE EVENTOS PARA CONFIRMAR
         ========================================================================= */}
      <section aria-labelledby="seccao-eventos" className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <CalendarCheck className="text-csc-gold" size={17} />
            <h2 id="seccao-eventos" className="font-display font-black text-sm uppercase tracking-wider text-white">
              Eventos para Confirmar
            </h2>
          </div>
          {eventosAConfirmar.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-csc-gold text-csc-tinta font-display font-black text-[11px]">
              {eventosAConfirmar.length} {eventosAConfirmar.length === 1 ? 'pendente' : 'pendentes'}
            </span>
          )}
        </div>

        {eventosAConfirmar.length > 0 ? (
          <div className="space-y-2.5">
            {eventosAConfirmar.map(evento => {
              const quando = new Date(evento.date_time)
              const rotuloTipo =
                evento.tipo === 'match'
                  ? 'Jogo'
                  : evento.tipo === 'practice'
                    ? 'Treino'
                    : 'Convívio'

              return (
                <CartaoSimples key={evento.id} className="p-3.5 space-y-3 border-csc-gold/30 bg-csc-gold/8">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-csc-gold/25 font-display font-bold text-[9.5px] uppercase tracking-wider text-csc-gold">
                          {rotuloTipo}
                        </span>
                        <span className="text-[10px] text-white/50">·</span>
                        <span className="font-display font-bold text-[10.5px] text-white/80">
                          {DIA_MES.format(quando)} às {hora(evento.date_time)}
                        </span>
                      </div>
                      <h3 className="font-display font-extrabold text-[13.5px] text-white leading-tight">
                        {evento.titulo}
                      </h3>
                      {evento.local && (
                        <p className="text-[11px] text-white/65 mt-1 flex items-center gap-1">
                          <MapPin size={11} className="text-csc-gold shrink-0" />
                          <span className="truncate">{evento.local}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success')
                        aoResponder(evento.id, 'confirmed')
                      }}
                      className="flex-1 h-9 rounded-xl font-display font-bold text-[12px] cursor-pointer bg-csc-light text-white flex items-center justify-center gap-1.5 transition-transform active:scale-97 shadow-sm hover:brightness-110"
                    >
                      <CheckCircle2 size={13} />
                      {utilizadorAdepto ? 'Vou apoiar' : 'Sim, vou'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('warning')
                        aoResponder(evento.id, 'declined')
                      }}
                      className="flex-1 h-9 rounded-xl font-display font-bold text-[12px] cursor-pointer bg-white/10 text-white/90 flex items-center justify-center gap-1.5 transition-transform active:scale-97 hover:bg-white/15"
                    >
                      <XCircle size={13} />
                      Não posso
                    </button>
                  </div>
                </CartaoSimples>
              )
            })}
          </div>
        ) : (
          <CartaoSimples className="p-4 flex items-center gap-3.5 bg-white/5 border-white/10">
            <div className="w-9 h-9 rounded-full bg-white/10 text-white/70 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="font-display font-extrabold text-[13px] text-white">Sem eventos por confirmar</p>
              <p className="text-[11px] text-white/60">
                Não tens treinos nem outros compromissos pendentes de resposta.
              </p>
            </div>
          </CartaoSimples>
        )}
      </section>

      {/* =========================================================================
          3. BLOCO DO PRÓXIMO JOGO
          (Se estiver por confirmar só aparece neste bloco!)
         ========================================================================= */}
      <section aria-labelledby="seccao-proximo-jogo" className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <Trophy className="text-csc-gold" size={17} />
            <h2 id="seccao-proximo-jogo" className="font-display font-black text-sm uppercase tracking-wider text-white">
              Próximo Jogo
            </h2>
          </div>
          {proximoJogo && (
            <span className="font-display font-bold text-[11px] text-white/70">
              {quantoFalta(proximoJogo.date_time)}
            </span>
          )}
        </div>

        {proximoJogo ? (
          (() => {
            const fora = proximoJogo.home_away === 'away'
            const siglaAdv =
              proximoJogo.opponent?.initials ||
              proximoJogo.opponent?.name?.slice(0, 3).toUpperCase() ||
              'ADV'
            const emblemaAdv = obterEmblemaEfetivo(
              proximoJogo.opponent?.logo_url,
              proximoJogo.opponent?.name,
              proximoJogo.opponent?.initials,
            )

            const equipaCasaSigla = fora ? siglaAdv : siglaClube
            const equipaForaSigla = fora ? siglaClube : siglaAdv

            const porConfirmar = proximoJogo.minhaResposta === 'called'
            const confirmado = proximoJogo.minhaResposta === 'confirmed'

            const emblemaCasa = (fora ? emblemaAdv : emblemaClube) || undefined
            const emblemaFora = (fora ? emblemaClube : emblemaAdv) || undefined

            return (
              <CartaoVidro className="overflow-hidden border border-white/20 shadow-xl">
                {/* Confronto Hero */}
                <div className="p-4 pt-4 pb-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-display font-extrabold text-[10px] tracking-wider uppercase text-csc-gold">
                      {DATA_LONGA.format(new Date(proximoJogo.date_time))}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] font-bold text-white/80">
                      {proximoJogo.is_friendly ? 'Amigável' : proximoJogo.prova || 'Oficial'}
                      {fora ? ' · Fora' : ' · Casa'}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-4 py-2">
                    {/* Casa */}
                    <div className="flex-1 flex flex-col items-center text-center">
                      <img
                        src={emblemaCasa}
                        alt=""
                        className="w-12 h-12 rounded-full bg-white object-contain p-1 shadow"
                      />
                      <span className="font-display font-black text-xs text-white mt-1.5 truncate max-w-full">
                        {equipaCasaSigla}
                      </span>
                    </div>

                    <span
                      className="font-display font-black text-2xl text-transparent"
                      style={{ WebkitTextStroke: '1.5px var(--color-csc-gold)' }}
                      aria-hidden="true"
                    >
                      VS
                    </span>

                    {/* Fora */}
                    <div className="flex-1 flex flex-col items-center text-center">
                      <img
                        src={emblemaFora}
                        alt=""
                        className="w-12 h-12 rounded-full bg-white object-contain p-1 shadow"
                      />
                      <span className="font-display font-black text-xs text-white mt-1.5 truncate max-w-full">
                        {equipaForaSigla}
                      </span>
                    </div>
                  </div>

                  {/* Horários */}
                  <div className="flex items-center justify-around mt-2 pt-2.5 border-t border-white/10 text-center">
                    {proximoJogo.meeting_time && (
                      <div>
                        <p className="text-[9.5px] uppercase font-bold text-white/50">Concentração</p>
                        <p className="font-display font-extrabold text-sm text-white mt-0.5">
                          {proximoJogo.meeting_time.substring(0, 5)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[9.5px] uppercase font-bold text-csc-gold">Pontapé de saída</p>
                      <p className="font-display font-extrabold text-sm text-white mt-0.5">
                        {hora(proximoJogo.date_time)}
                      </p>
                    </div>
                  </div>

                  {/* Campo */}
                  {proximoJogo.local && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        proximoJogo.morada ? `${proximoJogo.local}, ${proximoJogo.morada}` : proximoJogo.local,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => triggerHaptic('light')}
                      className="mt-2.5 flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[11px] text-white/80"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin size={12} className="text-csc-gold shrink-0" />
                        <span className="truncate">{proximoJogo.local}</span>
                      </div>
                      <ExternalLink size={12} className="text-white/40 shrink-0" />
                    </a>
                  )}
                </div>

                {/* Bloco de Resposta à Convocatória do Jogo */}
                {proximoJogo.minhaResposta !== null && (
                  <div
                    className={`p-3.5 border-t ${
                      porConfirmar
                        ? 'bg-csc-gold/20 border-csc-gold/40'
                        : confirmado
                          ? 'bg-emerald-500/15 border-emerald-500/30'
                          : 'bg-white/5 border-white/10'
                    }`}
                  >
                    {proximoJogo.fechada ? (
                      <p className="text-xs text-white/80 text-center">{proximoJogo.fechada}</p>
                    ) : porConfirmar ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="font-display font-extrabold text-[13px] text-csc-gold flex items-center gap-1.5">
                            <AlertTriangle size={14} />
                            {utilizadorAdepto ? 'Vais apoiar a equipa?' : 'Estás convocado! Vais ao jogo?'}
                          </p>
                          <span className="text-[10.5px] text-white/60">
                            {proximoJogo.confirmados} {proximoJogo.confirmados === 1 ? 'confirmado' : 'confirmados'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success')
                              aoResponder(proximoJogo.id, 'confirmed')
                            }}
                            className="flex-1 h-10 rounded-xl font-display font-extrabold text-[12.5px] cursor-pointer bg-csc-light text-white flex items-center justify-center gap-1.5 transition-transform active:scale-97 shadow-md hover:brightness-110"
                          >
                            <CheckCircle2 size={14} />
                            {utilizadorAdepto ? 'Vou apoiar' : 'Sim, vou'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('warning')
                              aoResponder(proximoJogo.id, 'declined')
                            }}
                            className="flex-1 h-10 rounded-xl font-display font-extrabold text-[12.5px] cursor-pointer bg-white/15 text-white flex items-center justify-center gap-1.5 transition-transform active:scale-97 hover:bg-white/20"
                          >
                            <XCircle size={14} />
                            Não posso
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {confirmado ? (
                            <>
                              <CheckCircle2 className="text-emerald-400 shrink-0" size={17} />
                              <div>
                                <p className="font-display font-bold text-xs text-emerald-300">
                                  {utilizadorAdepto ? 'Vais apoiar' : 'Presença confirmada'}
                                </p>
                                <p className="text-[10px] text-white/50">
                                  {proximoJogo.confirmados} atletas confirmados
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <XCircle className="text-white/60 shrink-0" size={17} />
                              <p className="font-display font-bold text-xs text-white/70">
                                Marcaste ausência
                              </p>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection')
                            aoResponder(proximoJogo.id, confirmado ? 'declined' : 'confirmed')
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10.5px] font-bold text-white/80 cursor-pointer"
                        >
                          Alterar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CartaoVidro>
            )
          })()
        ) : (
          <CartaoSimples className="p-4 text-center text-white/60 text-xs">
            Sem jogos marcados na agenda.
          </CartaoSimples>
        )}
      </section>

      {/* =========================================================================
          4. BLOCO DE CLASSIFICAÇÃO DA EQUIPA NAS DIVERSAS COMPETIÇÕES
         ========================================================================= */}
      <section aria-labelledby="seccao-classificacao" className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <Trophy className="text-csc-gold" size={17} />
          <h2 id="seccao-classificacao" className="font-display font-black text-sm uppercase tracking-wider text-white">
            Classificação da Equipa
          </h2>
        </div>

        {provas.length > 0 ? (
          <div className="space-y-3.5">
            {provas.map(prova => (
              <CartaoSimples key={prova.id} className="p-3.5 space-y-2.5 border-white/15 bg-black/40">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-extrabold text-[13px] text-white truncate">
                      {prova.nome}
                    </h3>
                    <p className="text-[10px] text-white/60">
                      {prova.grupo ? `${prova.grupo} · ` : ''}
                      {prova.epoca || 'Época atual'}
                    </p>
                  </div>
                  {prova.eliminatoria && (
                    <span className="px-2 py-0.5 rounded bg-csc-gold/20 text-csc-gold text-[9.5px] font-bold uppercase tracking-wider">
                      {prova.eliminatoria.nomeFase}
                    </span>
                  )}
                </div>

                {prova.eliminatoria ? (
                  <div className="space-y-1.5 pt-1">
                    {prova.eliminatoria.jogos.map(jg => (
                      <div
                        key={jg.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                          jg.nosso
                            ? 'bg-csc-gold/20 text-csc-gold font-bold border border-csc-gold/30'
                            : 'bg-white/5 text-white/80'
                        }`}
                      >
                        <span className="text-[9.5px] font-display uppercase text-white/50 w-6">
                          J{jg.numero}
                        </span>
                        <span className="flex-1 truncate text-right">{jg.casaNome}</span>
                        <span className="px-2 py-0.5 rounded bg-black/40 text-[10.5px] font-bold tabular-nums">
                          {jg.resultado ?? (jg.hora || 'vs')}
                        </span>
                        <span className="flex-1 truncate">{jg.foraNome}</span>
                      </div>
                    ))}
                  </div>
                ) : prova.linhas.length > 0 ? (
                  <div className="pt-1">
                    {/* Cabeçalho da Tabela */}
                    <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[9.5px] font-display font-black text-white/40 uppercase tracking-wider">
                      <span className="col-span-2 text-center">#</span>
                      <span className="col-span-5">Equipa</span>
                      <span className="col-span-1 text-center">J</span>
                      <span className="col-span-2 text-center">DG</span>
                      <span className="col-span-2 text-right">PTS</span>
                    </div>

                    {/* Linhas da Tabela */}
                    <div className="space-y-1">
                      {prova.linhas.map(linha => {
                        const eNos = linha.equipa.opponent_id === null
                        const nomeLinha =
                          linha.equipa.opponent?.initials ||
                          linha.equipa.opponent?.name ||
                          siglaClube

                        return (
                          <div
                            key={linha.id}
                            className={`grid grid-cols-12 gap-1 items-center px-2 py-1.5 rounded-lg text-xs ${
                              eNos
                                ? 'bg-csc-gold/20 text-white font-extrabold border border-csc-gold/40 shadow-sm'
                                : 'bg-white/5 text-white/80'
                            }`}
                          >
                            <span
                              className={`col-span-2 text-center font-display font-extrabold text-[11px] ${
                                eNos ? 'text-csc-gold' : 'text-white/60'
                              }`}
                            >
                              {linha.posicao}º
                            </span>
                            <span className="col-span-5 truncate font-display font-bold">
                              {nomeLinha}
                            </span>
                            <span className="col-span-1 text-center tabular-nums text-white/60">
                              {linha.j}
                            </span>
                            <span className="col-span-2 text-center tabular-nums text-white/60">
                              {linha.dg > 0 ? `+${linha.dg}` : linha.dg}
                            </span>
                            <span
                              className={`col-span-2 text-right font-display font-black tabular-nums text-sm ${
                                eNos ? 'text-csc-gold' : 'text-white'
                              }`}
                            >
                              {linha.p}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/50 text-center py-2">
                    Classificação ainda não iniciada nesta competição.
                  </p>
                )}
              </CartaoSimples>
            ))}
          </div>
        ) : (
          <CartaoSimples className="p-4 text-center text-white/60 text-xs">
            Sem competições ativas de momento.
          </CartaoSimples>
        )}
      </section>

      {/* =========================================================================
          RODAPÉ DO MODO SIMPLES
         ========================================================================= */}
      <div className="pt-2 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection')
            aoSairModoSimples()
          }}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-transform active:scale-97"
        >
          <span>Voltar ao Modo Completo</span>
          <ArrowRight size={13} />
        </button>
        <p className="text-[10px] text-white/40">
          O menu e todas as restantes áreas da app voltam a ficar disponíveis.
        </p>
      </div>
    </div>
  )
}

export default VistaModoSimples
