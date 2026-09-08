import React from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, ExternalLink, CheckCircle2, XCircle, Shield } from 'lucide-react'
import { CartaoVidro } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

/**
 * Uma página do carrossel do próximo jogo (bloco 2 da Home).
 *
 * **O confronto é o título do ecrã, não uma linha dentro do cartão.** No
 * desenho da Home o jogo abre a página: a data em sobrancelha dourada, os dois
 * clubes em 44px sobre a faixa verde, e por baixo a pastilha do que falta e a
 * natureza do jogo. Só depois vem o cartão de vidro, que começa nos emblemas.
 * Estava tudo lá dentro, em corpo pequeno, e a Home não tinha assunto — abria
 * num cartão de informação em vez de abrir no jogo.
 *
 * O herói vive dentro da página do carrossel, e não fora dele: com dois jogos
 * marcados, arrastar tem de mudar o título e o cartão ao mesmo tempo, senão a
 * data em cima passa a mentir sobre o cartão em baixo.
 *
 * **Sem meteorologia.** O desenho tem "19° · vento 24 km/h" ao lado do
 * pontapé de saída. A app não tem fonte de meteorologia nenhuma — nem chave,
 * nem serviço — e inventar um número era pior do que não o ter. Fica
 * registado como proposta em `docs/ecras-por-desenhar.md`.
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
  const navegar = useNavigate()
  const fora = jogo.home_away === 'away'
  const sigla = jogo.opponent?.initials || jogo.opponent?.name?.slice(0, 3).toUpperCase() || 'ADV'

  /* A ordem é a do placar: quem joga em casa à esquerda (e na primeira linha
     do título), quem visita à direita. */
  const equipaCasa = fora ? sigla : siglaClube
  const equipaFora = fora ? siglaClube : sigla

  const emblema = (url: string | null, alt: string) =>
    url ? (
      <img
        src={url}
        alt={alt}
        className="w-[58px] h-[58px] rounded-full bg-white object-contain p-1 flex-none"
      />
    ) : (
      /* Sem emblema fica um escudo. As iniciais estão no título, em 44px,
         três linhas acima — repeti-las aqui era dizer "GDPCC" duas vezes. */
      <span
        aria-label={alt}
        role="img"
        className="w-[58px] h-[58px] rounded-full bg-white/95 flex items-center justify-center text-csc-dark flex-none"
      >
        <Shield size={26} />
      </span>
    )

  const nos = (
    <span className="w-[100px] flex flex-col items-center gap-2">
      {emblema(emblemaClube, siglaClube)}
      <span className="font-display font-bold text-[12px] text-white/85">{fora ? 'Fora' : 'Casa'}</span>
    </span>
  )
  const eles = (
    <span className="w-[100px] flex flex-col items-center gap-2">
      {emblema(jogo.opponent?.logo_url ?? null, jogo.opponent?.name ?? 'Adversário')}
      <span className="font-display font-bold text-[12px] text-white/85">{fora ? 'Casa' : 'Fora'}</span>
    </span>
  )

  /* Todo o bloco abre o evento na Agenda. Não pode ser um `<button>`: tem lá
     dentro o link do Maps e os dois botões de resposta. Fica o papel e o
     tratamento das teclas à mão, a convenção do CLAUDE.md. */
  const abrirEvento = () => {
    triggerHaptic('light')
    navegar(`/calendar?event=${jogo.id}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrirEvento}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          abrirEvento()
        }
      }}
      aria-label={`Ver o jogo ${equipaCasa} contra ${equipaFora}, ${DATA_LONGA.format(new Date(jogo.date_time))}`}
      className="flex flex-col gap-[18px] cursor-pointer rounded-[26px]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
    >
      {/* O herói: a data, o confronto e o que falta — direto sobre a faixa. */}
      <div className="px-0.5 pt-[18px]">
        <p className="font-display font-extrabold text-[10px] tracking-[0.24em] uppercase text-csc-gold">
          {DATA_LONGA.format(new Date(jogo.date_time))}
        </p>

        <h2 className="font-display font-black text-[44px] leading-none tracking-[-0.035em] text-white mt-3">
          {equipaCasa}
          <br />
          <span className="text-[28px] text-white/42">vs</span> {equipaFora}
        </h2>

        <div className="flex items-center gap-2.5 mt-4">
          <span className="flex-none inline-flex items-center h-[26px] px-[11px] rounded-[13px] bg-black/35 border border-white/15 font-display font-bold text-[11px] text-white">
            {quantoFalta(jogo.date_time)}
          </span>
          <span className="min-w-0 truncate text-[12.5px] text-white/72">
            {jogo.is_friendly ? 'Amigável' : jogo.prova || 'Jogo oficial'}
            {jogo.home_away === 'neutral' ? ' · campo neutro' : fora ? ' · fora de casa' : ' · em casa'}
          </span>
        </div>
      </div>

      <CartaoVidro className="overflow-hidden">
        {/* Os emblemas, com o "VS" vazado a dourado entre eles. */}
        <div className="flex items-center justify-center gap-6 px-[18px] pt-[18px] pb-4">
          {fora ? eles : nos}
          <span
            className="flex-none font-display font-black text-[28px] mb-5 text-transparent"
            style={{ WebkitTextStroke: '1.5px var(--color-csc-gold)' }}
            aria-hidden="true"
          >
            VS
          </span>
          {fora ? nos : eles}
        </div>

        {/* As duas horas, divididas: a de concentração é a que não se falha. */}
        <div className="flex items-stretch border-t border-white/13">
          {jogo.meeting_time && (
            <>
              <div className="flex-none px-[17px] py-[15px]">
                <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-white/55">
                  Concentração
                </p>
                <p className="font-display font-extrabold text-[22px] text-white mt-1">
                  {jogo.meeting_time.substring(0, 5)}
                </p>
              </div>
              <div className="w-px bg-white/13" />
            </>
          )}
          <div className="flex-1 px-[17px] py-[15px]">
            <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-csc-gold">
              Pontapé de saída
            </p>
            <p className="font-display font-extrabold text-[22px] text-white mt-1">{hora(jogo.date_time)}</p>
          </div>
        </div>

        {jogo.local && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              jogo.morada ? `${jogo.local}, ${jogo.morada}` : jogo.local,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { e.stopPropagation(); triggerHaptic('light') }}
            className="flex items-center gap-2.5 px-[17px] py-3.5 min-h-11 border-t border-white/13
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <MapPin size={14} className="text-csc-gold shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block font-display font-bold text-[12.5px] text-white truncate">{jogo.local}</span>
              {jogo.morada && (
                <span className="block text-[11.5px] leading-snug text-white/70 truncate">{jogo.morada}</span>
              )}
            </span>
            <ExternalLink size={14} className="text-white/40 shrink-0" />
          </a>
        )}

        {/* O pedido de resposta. Fechado, diz porquê em vez de oferecer botões. */}
        {jogo.minhaResposta !== null && (
          <div className="px-[17px] py-[15px] pb-[17px] bg-csc-gold/13 border-t border-csc-gold/24">
            {jogo.fechada ? (
              <p className="text-[11.5px] text-white/80 text-center">{jogo.fechada}</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-display font-extrabold text-[14px] text-white">
                    {jogo.minhaResposta === 'confirmed'
                      ? 'Contamos contigo.'
                      : jogo.minhaResposta === 'declined'
                        ? 'Ficas de fora.'
                        : 'Contamos contigo?'}
                  </span>
                  <span className="text-[11px] text-white/60 flex-none">
                    {jogo.confirmados} {jogo.confirmados === 1 ? 'confirmado' : 'confirmados'}
                  </span>
                </div>
                <div className="flex gap-[11px] mt-3">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); aoResponder(jogo.id, 'confirmed') }}
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
                    onClick={e => { e.stopPropagation(); aoResponder(jogo.id, 'declined') }}
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
    </div>
  )
}

export default CartaoProximoJogo
