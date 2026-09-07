import React, { useEffect, useState } from 'react'
import { MapPin, Pencil, Trash2, ExternalLink, Copy, Star, Info } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { VistaDetalhe } from '../VistaDetalhe'
import { EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'
import { toast } from '../../context/ToastContext'

/**
 * Ficha do campo (ecrã 9i).
 *
 * **Não há mapa dentro da app, e isto é uma decisão e não uma falha.** O
 * handoff desenhava um quadrado de mapa; embeber um mapa a sério obriga a um
 * componente novo e a uma chave de API que se paga por utilização, para
 * mostrar um retângulo de dois campos que toda a gente do clube já conhece. O
 * que a app faz — e faz desde sempre, na Agenda — é abrir o Google Maps por
 * URL. A ficha diz isso em letra pequena, para ninguém pensar que o mapa não
 * carregou.
 *
 * Sem morada os dois botões ficam desativados: metade dos campos em produção
 * não tem morada nenhuma, e um "Copiar morada" que copia vazio é pior do que
 * um botão apagado.
 */

export interface CampoDaFicha {
  id: string
  name: string
  address: string
}

interface EventoNoCampo {
  id: string
  title: string | null
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  opponent: { name: string; initials: string | null } | null
  tournament: { name: string } | null
}

interface FichaCampoProps {
  campo: CampoDaFicha | null
  /** É o campo de casa do clube (`club_settings.home_field_id`). */
  eCampoDoClube: boolean
  siglaClube: string
  aoFechar: () => void
  aoEditar: () => void
  aoEliminar: () => void
}

const TIPO_ETIQUETA: Record<EventoNoCampo['type'], string> = {
  match: 'Jogo',
  practice: 'Treino',
  gathering: 'Convívio',
}

export const FichaCampo: React.FC<FichaCampoProps> = ({
  campo,
  eCampoDoClube,
  siglaClube,
  aoFechar,
  aoEditar,
  aoEliminar,
}) => {
  const [proximos, setProximos] = useState<EventoNoCampo[] | null>(null)

  const id = campo?.id ?? null

  useEffect(() => {
    if (!id) {
      setProximos(null)
      return
    }
    let cancelado = false
    setProximos(null)

    supabase
      .from('events')
      .select('id, title, type, date_time, opponent:opponents(name, initials), tournament:tournaments(name)')
      .eq('field_id', id)
      .gte('date_time', new Date().toISOString())
      .order('date_time', { ascending: true })
      .limit(6)
      .then(({ data }) => {
        if (!cancelado) setProximos((data ?? []) as unknown as EventoNoCampo[])
      })

    return () => { cancelado = true }
  }, [id])

  const temMorada = Boolean(campo?.address?.trim())
  const consulta = campo ? (temMorada ? `${campo.name}, ${campo.address}` : campo.name) : ''

  const copiarMorada = async () => {
    if (!campo || !temMorada) return
    triggerHaptic('light')
    try {
      await navigator.clipboard.writeText(campo.address)
      toast.success('Morada copiada.')
    } catch {
      // Sem permissão de área de transferência (http, ou o utilizador negou):
      // dizê-lo é melhor do que um botão que não faz nada.
      toast.error('O telemóvel não deixou copiar. Seleciona a morada à mão.')
    }
  }

  return (
    <VistaDetalhe
      isOpen={Boolean(campo)}
      onClose={aoFechar}
      title={campo?.name ?? ''}
      description="Campo"
      ariaLabel={'Ficha do campo ' + (campo?.name ?? '')}
    >
      {campo && (
        <div className="space-y-3">
          {eCampoDoClube && (
            <span
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-2xl bg-csc-gold/16 border border-csc-gold/32
                font-display font-extrabold text-[9px] tracking-[0.12em] uppercase text-csc-gold"
            >
              <Star size={11} /> Campo do clube
            </span>
          )}

          {/* Morada */}
          <div className="cartao-vidro px-4 py-4">
            <EtiquetaSeccao como="p">Morada</EtiquetaSeccao>
            {temMorada ? (
              <p className="font-display font-bold text-[15px] leading-snug text-white mt-2 text-pretty">
                {campo.address}
              </p>
            ) : (
              <p className="text-[11.5px] text-white/50 mt-2">
                Este campo ainda não tem morada. Sem ela não há como abrir o mapa nem copiar
                nada — acrescenta-a em Editar campo.
              </p>
            )}
          </div>

          <div className="flex gap-2.5">
            <a
              href={temMorada ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!temMorada}
              onClick={e => {
                if (!temMorada) e.preventDefault()
                else triggerHaptic('light')
              }}
              className={`flex-1 h-12 rounded-3xl bg-white/8 border border-white/16 text-white
                font-display font-extrabold text-[11.5px] flex items-center justify-center gap-2
                transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-csc-gold ${
                  temMorada ? 'cursor-pointer active:scale-97' : 'opacity-45 cursor-not-allowed'
                }`}
            >
              Ver no Maps <ExternalLink size={13} />
            </a>
            <button
              type="button"
              onClick={copiarMorada}
              disabled={!temMorada}
              className="flex-1 h-12 rounded-3xl bg-csc-light/14 border border-csc-light/32 text-csc-verde-texto
                font-display font-extrabold text-[11.5px] flex items-center justify-center gap-2 cursor-pointer
                transition-transform duration-150 active:scale-97 disabled:opacity-45 disabled:cursor-not-allowed
                disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Copy size={13} /> Copiar morada
            </button>
          </div>

          <div className="cartao-simples flex items-start gap-2.5 px-3.5 py-3">
            <Info size={15} className="text-white/45 shrink-0 mt-0.5" />
            <p className="flex-1 text-[10px] leading-normal text-white/50">
              Não há mapa dentro da app: o "Ver no Maps" abre o Google Maps no telemóvel.
            </p>
          </div>

          {/* Próximos eventos aqui */}
          <section>
            <EtiquetaSeccao className="mb-2">Próximos eventos aqui</EtiquetaSeccao>
            {proximos === null ? (
              <div className="cartao-simples h-20 animate-pulse" />
            ) : proximos.length === 0 ? (
              <div className="cartao-simples border-dashed px-4 py-6 text-center">
                <p className="text-[11.5px] text-white/55">Nada marcado neste campo.</p>
              </div>
            ) : (
              <div className="cartao-simples overflow-hidden">
                {proximos.map(evento => {
                  const quando = new Date(evento.date_time)
                  const titulo = evento.type === 'match'
                    ? `${siglaClube} vs ${evento.opponent?.initials || evento.opponent?.name || 'adversário'}`
                    : (evento.title || TIPO_ETIQUETA[evento.type])
                  return (
                    <div
                      key={evento.id}
                      className="flex items-center gap-3 px-4 py-3 border-t border-white/7 first:border-t-0"
                    >
                      <span className="w-9 shrink-0 text-center">
                        <span className="block font-display font-black text-[15px] text-csc-gold leading-none tabular-nums">
                          {String(quando.getDate()).padStart(2, '0')}
                        </span>
                        <span className="block font-display font-bold text-[8px] tracking-[0.1em] uppercase text-white/45 mt-0.5">
                          {quando.toLocaleDateString('pt-PT', { weekday: 'short' }).replace(/\.?(-feira)?,?$/, '')}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-display font-bold text-xs text-white truncate">{titulo}</span>
                        <span className="block text-[9.5px] text-white/45 mt-0.5 truncate">
                          {quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          {evento.tournament?.name ? ` · ${evento.tournament.name}` : ''}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Editar e eliminar */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { triggerHaptic('light'); aoEditar() }}
              className="flex-1 h-12 rounded-3xl bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px]
                flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Pencil size={15} /> Editar campo
            </button>
            <button
              type="button"
              onClick={() => { triggerHaptic('warning'); aoEliminar() }}
              disabled={eCampoDoClube}
              className="flex-1 h-12 rounded-3xl bg-csc-red/15 border border-csc-red/35 text-csc-vermelho-texto
                font-display font-extrabold text-[12.5px] flex items-center justify-center gap-2 cursor-pointer
                transition-transform duration-150 active:scale-97 disabled:opacity-45 disabled:cursor-not-allowed
                disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Trash2 size={15} /> Eliminar
            </button>
          </div>

          {eCampoDoClube && (
            <p className="flex items-start gap-1.5 text-[10px] leading-normal text-white/42 px-1">
              <MapPin size={12} className="shrink-0 mt-px" />
              O campo do clube não se elimina sem escolher outro nos dados do clube.
            </p>
          )}
        </div>
      )}
    </VistaDetalhe>
  )
}

export default FichaCampo
