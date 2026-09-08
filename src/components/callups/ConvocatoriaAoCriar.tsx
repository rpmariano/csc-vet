import React, { useEffect, useState } from 'react'
import { Check, Users, RotateCcw, X, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { BottomSheet } from '../BottomSheet'
import { Botao } from '../ui'

/**
 * Convocar, logo a seguir a guardar o evento (ecrãs 4f e 4g).
 *
 * Antes a convocatória era um bloco no meio do formulário de criação: quem
 * criava um jogo às pressas guardava e ia à sua vida, e o evento ficava na
 * agenda sem ninguém chamado — que é a origem do alerta de convocatórias (4c).
 * Agora guardar leva sempre aqui, e o passo tem nome: "falta convocar".
 *
 * **Num treino não há escolha a fazer** (4g): entram todos os aptos, ficam de
 * fora lesionados e inativos. A persiana mostra quem foi convocado e pede uma
 * confirmação, com a porta aberta para ajustar a lista.
 *
 * **Num rascunho ninguém é avisado.** A convocatória fica guardada na mesma —
 * é o que a app já fazia — mas o botão diz o que acontece, para não haver
 * dúvidas sobre quem recebeu o quê.
 *
 * A inserção das linhas de `callups` acontece aqui e em mais lado nenhum do
 * fluxo de criação: era feita no `handleCreateEvent`, e ter dois sítios a
 * escrever a mesma tabela era como se perdia a conta de quem estava chamado.
 */

export interface AtletaConvocavel {
  id: string
  name: string
  shirt_name?: string | null
  nickname?: string | null
  jersey_number?: number | null
  position?: string | null
  status?: string | null
}

export interface EventoCriado {
  id: string
  tipo: 'match' | 'practice' | 'gathering'
  titulo: string
  quando: string
  local?: string | null
  ativo: boolean
}

const ROTULO_TIPO: Record<EventoCriado['tipo'], string> = {
  match: 'Jogo criado',
  practice: 'Treino criado',
  gathering: 'Convívio criado',
}

const nomeCurto = (p: AtletaConvocavel) =>
  p.shirt_name?.trim() || p.nickname?.trim() || p.name

export const ConvocatoriaAoCriar: React.FC<{
  evento: EventoCriado | null
  aoFechar: () => void
  /** O plantel elegível para este tipo de evento, já filtrado por quem chama. */
  aptos: AtletaConvocavel[]
  /** Todos os que aparecem na lista, aptos ou não. */
  todos: AtletaConvocavel[]
  /** Quem já vinha escolhido no formulário. */
  preEscolhidos: string[]
  /** Depois de gravar, para a página recarregar a lista de eventos. */
  aoConvocar: () => void
}> = ({ evento, aoFechar, aptos, todos, preEscolhidos, aoConvocar }) => {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [aGravar, setAGravar] = useState(false)
  const [aAjustar, setAAjustar] = useState(false)

  const idsAptos = new Set(aptos.map(p => p.id))
  const eTreino = evento?.tipo === 'practice'

  useEffect(() => {
    if (!evento) return
    // Num treino a escolha já está feita: todos os aptos.
    setEscolhidos(new Set(eTreino ? aptos.map(p => p.id) : preEscolhidos))
    setAAjustar(false)
  }, [evento?.id])

  if (!evento) return null

  const alternar = (id: string) => {
    triggerHaptic('selection')
    setEscolhidos(atual => {
      const seguinte = new Set(atual)
      if (seguinte.has(id)) seguinte.delete(id)
      else seguinte.add(id)
      return seguinte
    })
  }

  const repetirUltima = async () => {
    triggerHaptic('light')
    const { data } = await supabase
      .from('events')
      .select('id, callups(player_id)')
      .eq('type', evento.tipo)
      .neq('id', evento.id)
      .lt('date_time', evento.quando)
      .order('date_time', { ascending: false })
      .limit(1)

    const anterior = (data ?? [])[0] as { callups?: { player_id: string }[] } | undefined
    const ids = (anterior?.callups ?? []).map(c => c.player_id)
    if (ids.length === 0) {
      toast.warning('Não há convocatória anterior deste tipo para repetir.')
      return
    }
    setEscolhidos(new Set(ids))
    toast.success(`Repetida a última convocatória: ${ids.length} atletas.`)
  }

  const convocar = async () => {
    setAGravar(true)
    try {
      const ids = [...escolhidos]
      if (ids.length > 0) {
        const { error } = await supabase.from('callups').insert(
          ids.map(playerId => ({ event_id: evento.id, player_id: playerId, status: 'called' })),
        )
        if (error) throw error
      }
      toast.success(
        ids.length === 0
          ? 'Evento guardado sem convocatória. Fica no alerta até alguém ser convocado.'
          : evento.ativo
            ? `${ids.length} ${ids.length === 1 ? 'atleta convocado' : 'atletas convocados'}.`
            : `${ids.length} ${ids.length === 1 ? 'atleta guardado' : 'atletas guardados'} no rascunho — ninguém foi avisado.`,
      )
      aoConvocar()
      aoFechar()
    } catch (err) {
      toast.error('Não foi possível convocar: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      setAGravar(false)
    }
  }

  const quando = new Date(evento.quando)
  const listaVisivel = eTreino && !aAjustar ? todos.filter(p => escolhidos.has(p.id)) : todos

  return (
    <BottomSheet
      isOpen={Boolean(evento)}
      onClose={aoFechar}
      title={ROTULO_TIPO[evento.tipo]}
      description={eTreino ? 'A convocatória é automática' : 'Falta convocar'}
      closeOnOverlayClick={false}
      icon={
        <div className="w-9 h-9 rounded-xl bg-csc-light/20 text-csc-verde-texto flex items-center justify-center shrink-0">
          <Check size={18} />
        </div>
      }
      footer={
        eTreino && !aAjustar ? (
          <>
            <Botao aparencia="vidro" onClick={() => setAAjustar(true)}>Ajustar lista</Botao>
            <Botao onClick={convocar} disabled={aGravar}>
              {aGravar ? 'A guardar…' : 'Está bem assim'}
            </Botao>
          </>
        ) : (
          <>
            <Botao aparencia="vidro" onClick={aoFechar} disabled={aGravar}>Agora não</Botao>
            <Botao onClick={convocar} disabled={aGravar}>
              {aGravar
                ? 'A guardar…'
                : escolhidos.size === 0
                  ? 'Guardar sem convocar'
                  : `Convocar ${escolhidos.size}`}
            </Botao>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* O evento que acabou de nascer. */}
        <div className="cartao-simples p-3.5 flex items-center gap-3">
          <span className="w-11 shrink-0 text-center">
            <span className="block font-display font-black text-[17px] text-csc-gold leading-none tabular-nums">
              {quando.getDate()}
            </span>
            <span className="block font-display font-bold text-[8.5px] tracking-[0.1em] uppercase text-white/62 mt-0.5">
              {quando.toLocaleDateString('pt-PT', { weekday: 'short' }).replace(/\.?(-feira)?,?$/, '')}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-[13px] text-white truncate">
              {evento.titulo}
            </span>
            <span className="block text-[10.5px] text-white/62 mt-0.5 truncate">
              {quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              {evento.local ? ` · ${evento.local}` : ''}
            </span>
          </span>
          {!evento.ativo && (
            <span className="font-display font-black text-[8.5px] tracking-[0.1em] uppercase text-csc-gold bg-csc-gold/15 border border-csc-gold/30 px-2 py-1 rounded-full shrink-0">
              Rascunho
            </span>
          )}
        </div>

        {eTreino && !aAjustar ? (
          <>
            <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62">
              {escolhidos.size} {escolhidos.size === 1 ? 'apto convocado' : 'aptos convocados'}
            </p>
            <p className="text-[10.5px] leading-relaxed text-white/62 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
              Nos treinos a convocatória é automática: entram todos os atletas aptos, ficam de fora
              lesionados e inativos.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62">
                Quem convocas?
              </p>
              <p className="font-display font-black text-[11px] text-csc-gold shrink-0">
                {escolhidos.size} {escolhidos.size === 1 ? 'escolhido' : 'escolhidos'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { triggerHaptic('light'); setEscolhidos(new Set(aptos.map(p => p.id))) }}
                className="min-h-11 px-3.5 rounded-[22px] bg-csc-light/15 border border-csc-light/35 text-csc-verde-texto
                  font-display font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <Users size={13} />
                Todos os aptos
              </button>
              <button
                type="button"
                onClick={repetirUltima}
                className="min-h-11 px-3.5 rounded-[22px] bg-white/8 border border-white/15 text-white/75
                  font-display font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <RotateCcw size={13} />
                Repetir última
              </button>
              <button
                type="button"
                onClick={() => { triggerHaptic('light'); setEscolhidos(new Set()) }}
                className="min-h-11 px-3.5 rounded-[22px] bg-white/8 border border-white/15 text-white/75
                  font-display font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={13} />
                Limpar
              </button>
            </div>
          </>
        )}

        {/* A lista. */}
        <div className="cartao-simples overflow-hidden">
          {listaVisivel.map(p => {
            const escolhido = escolhidos.has(p.id)
            const apto = idsAptos.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alternar(p.id)}
                aria-pressed={escolhido}
                className="w-full min-h-14 flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer
                  border-t border-white/7 first:border-t-0
                  focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
              >
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    escolhido ? 'bg-csc-gold border-csc-gold text-csc-tinta' : 'border-white/25'
                  }`}
                  aria-hidden="true"
                >
                  {escolhido && <Check size={13} strokeWidth={3} />}
                </span>

                <span className="w-7 h-7 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[10px] flex items-center justify-center shrink-0">
                  {p.jersey_number ?? '–'}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold text-[12.5px] text-white truncate">
                    {nomeCurto(p)}
                  </span>
                  <span className="block text-[9.5px] text-white/62 truncate mt-0.5">
                    {p.status === 'injured' ? 'lesionado' : p.status === 'inactive' ? 'inativo' : 'apto'}
                  </span>
                </span>

                {!apto && (
                  <TriangleAlert size={13} className="text-csc-gold/60 shrink-0" />
                )}
              </button>
            )
          })}
        </div>

        <p className="text-[10.5px] leading-relaxed text-white/62">
          {evento.ativo
            ? 'Convocar avisa logo os escolhidos.'
            : 'Em rascunho o evento fica só para a equipa técnica: ninguém é avisado e não entra no alerta de convocatórias.'}
        </p>
      </div>
    </BottomSheet>
  )
}

export default ConvocatoriaAoCriar
