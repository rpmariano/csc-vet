import React from 'react'
import { MapPin, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { CartaoVidro } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

/**
 * Uma página do carrossel do próximo jogo (bloco 2 da Home).
 *
 * Vai da data até ao pedido de resposta: o confronto com os emblemas e a
 * condição de casa ou fora, quanto falta, a concentração e o pontapé de saída
 * lado a lado, o campo com o caminho para o Maps, e o Sim/Não com a contagem
 * de quem já confirmou.
 *
 * **Sem meteorologia.** O desenho tem "19° · vento 24 km/h" no cartão. A app
 * não tem fonte de meteorologia nenhuma — nem chave, nem serviço — e inventar
 * um número era pior do que não o ter. Fica registado como proposta.
 */

export interface JogoDaHome {
  id: string
  date_time: string
  meeting_time?: string | null
  is_friendly?: boolean
  home_away?: 'home' | 'away' | 'neutral' | null
  local: string
  morada: string | null
  prova: string | null
  opponent: { name: string; initials: string | null; logo_url: string | null } | null
  /** Estado da minha convocatória, ou `null` se não fui convocado. */
  minhaResposta: 'called' | 'confirmed' | 'declined' | null
  confirmados: number
  /** `null` quando a convocatória aceita resposta; senão a frase que a fecha. */
  fechada: string | null
}

const DATA_LONGA = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

/** "É hoje" · "É amanhã" · "Em 8 dias" */
function quantoFalta(iso: string): string {
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (dias <= 0) return 'É hoje'
  if (dias === 1) return 'É amanhã'
  return `Em ${dias} dias`
}

export const CartaoProximoJogo: React.FC<{
  jogo: JogoDaHome
  siglaClube: string
  emblemaClube: string
  aoResponder: (id: string, status: 'confirmed' | 'declined') => void
}> = ({ jogo, siglaClube, emblemaClube, aoResponder }) => {
  const fora = jogo.home_away === 'away'
  const sigla = jogo.opponent?.initials || jogo.opponent?.name?.slice(0, 3).toUpperCase() || 'ADV'

  const emblema = (url: string | null, alt: string, texto: string) =>
    url ? (
      <img src={url} alt={alt} className="w-12 h-12 rounded-full bg-white object-contain p-0.5 flex-none" />
    ) : (
      <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center font-display font-extrabold text-[11px] text-csc-dark flex-none">
        {texto}
      </span>
    )

  const nos = (
    <span className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
      {emblema(emblemaClube, siglaClube, siglaClube)}
      <span className="font-display font-extrabold text-[11px] text-white">{siglaClube}</span>
      <span className="text-[9px] text-white/62">{fora ? 'Fora' : 'Casa'}</span>
    </span>
  )
  const eles = (
    <span className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
      {emblema(jogo.opponent?.logo_url ?? null, jogo.opponent?.name ?? 'Adversário', sigla)}
      <span className="font-display font-extrabold text-[11px] text-white truncate max-w-full">{sigla}</span>
      <span className="text-[9px] text-white/62">{fora ? 'Casa' : 'Fora'}</span>
    </span>
  )

  return (
    <CartaoVidro className="overflow-hidden">
      <div className="p-[17px]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display font-extrabold text-[9.5px] tracking-[0.18em] text-csc-gold uppercase">
            {DATA_LONGA.format(new Date(jogo.date_time))}
          </p>
          <p className="text-[10px] text-white/62 flex-none">{quantoFalta(jogo.date_time)}</p>
        </div>

        <p className="text-[10.5px] text-white/62 mt-1">
          {jogo.is_friendly ? 'Amigável' : jogo.prova || 'Jogo oficial'}
          {jogo.home_away === 'neutral' ? ' · campo neutro' : fora ? ' · fora de casa' : ' · em casa'}
        </p>

        {/* O confronto. A ordem segue quem joga em casa, como no placar. */}
        <div className="flex items-center gap-2 mt-4">
          {fora ? eles : nos}
          <span className="font-display font-black text-[13px] text-white/50 flex-none px-1">VS</span>
          {fora ? nos : eles}
        </div>

        {/* As duas horas, divididas: a de concentração é a que não se falha. */}
        <div className="flex items-stretch -mx-[17px] mt-4 border-y border-white/13">
          {jogo.meeting_time && (
            <>
              <div className="flex-none px-[17px] py-2.5">
                <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-white/62">
                  Concentração
                </p>
                <p className="font-display font-extrabold text-[17px] text-white mt-0.5">
                  {jogo.meeting_time.substring(0, 5)}
                </p>
              </div>
              <div className="w-px bg-white/13" />
            </>
          )}
          <div className="flex-1 px-[17px] py-2.5">
            <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-csc-gold">
              Pontapé de saída
            </p>
            <p className="font-display font-extrabold text-[17px] text-white mt-0.5">{hora(jogo.date_time)}</p>
          </div>
        </div>

        {jogo.local && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              jogo.morada ? `${jogo.local}, ${jogo.morada}` : jogo.local,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => triggerHaptic('light')}
            className="flex items-center gap-2 mt-3 min-h-11 -mb-1
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-xl"
          >
            <MapPin size={13} className="text-csc-red shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-bold text-white truncate">{jogo.local}</span>
              {jogo.morada && <span className="block text-[10px] text-white/62 truncate">{jogo.morada}</span>}
            </span>
            <ExternalLink size={13} className="text-white/62 shrink-0" />
          </a>
        )}
      </div>

      {/* O pedido de resposta. Fechado, diz porquê em vez de oferecer botões. */}
      {jogo.minhaResposta !== null && (
        <div className="px-[17px] py-3.5 bg-[rgba(23,69,42,.55)] border-t border-csc-light/35">
          {jogo.fechada ? (
            <p className="text-[11.5px] text-white/80 text-center">{jogo.fechada}</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-extrabold text-[13px] text-white">
                  {jogo.minhaResposta === 'confirmed'
                    ? 'Contamos contigo.'
                    : jogo.minhaResposta === 'declined'
                      ? 'Ficas de fora.'
                      : 'Contamos contigo?'}
                </span>
                <span className="text-[10px] text-white/62 flex-none">
                  {jogo.confirmados} {jogo.confirmados === 1 ? 'confirmado' : 'confirmados'}
                </span>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => aoResponder(jogo.id, 'confirmed')}
                  aria-pressed={jogo.minhaResposta === 'confirmed'}
                  className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                    flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                      jogo.minhaResposta === 'confirmed'
                        ? 'bg-csc-light border-csc-light text-white'
                        : 'bg-white/9 border-white/20 text-white'
                    }`}
                >
                  {jogo.minhaResposta === 'confirmed' && <CheckCircle2 size={14} />}
                  Sim, vou
                </button>
                <button
                  type="button"
                  onClick={() => aoResponder(jogo.id, 'declined')}
                  aria-pressed={jogo.minhaResposta === 'declined'}
                  className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                    flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                      jogo.minhaResposta === 'declined'
                        ? 'bg-white/90 border-white/90 text-csc-tinta'
                        : 'bg-white/9 border-white/20 text-white'
                    }`}
                >
                  {jogo.minhaResposta === 'declined' && <XCircle size={14} />}
                  Não posso
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </CartaoVidro>
  )
}

export default CartaoProximoJogo
