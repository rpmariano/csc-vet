import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TriangleAlert, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from './BottomSheet'
import { Botao } from './ui'

/**
 * Eventos por convocar (ecrãs 4c e 4d).
 *
 * Um jogo marcado e sem convocatória é o erro caro desta app: chega o sábado
 * e ninguém apareceu porque ninguém foi chamado. O aviso vive na Home de quem
 * gere e abre a lista do que falta, com o caminho direto para convocar.
 *
 * **Os treinos não entram.** A criação de um treino convoca automaticamente
 * todos os aptos, por isso um treino sem convocatória é um treino sem
 * ninguém apto — outro problema, e não este.
 *
 * **Os rascunhos também não.** Um evento inativo é da equipa técnica: ninguém
 * foi avisado porque ainda não se quis avisar.
 */

/*
  Não há janela de dias.

  Havia: só entravam os eventos a menos de sete dias, para o aviso não andar
  a chatear meses antes. Na prática deixava passar precisamente o que se quer
  apanhar — um jogo marcado com duas semanas de antecedência ficava sem
  convocatória e sem aviso, e o aviso só chegava quando já faltava pouco.

  E era incoerente: o cartão da Agenda (ecrã 4e) sempre avisou sem janela
  nenhuma, portanto o mesmo evento aparecia por convocar num ecrã e não no
  outro.

  Se algum dia isto ficar ruidoso — muitos eventos longínquos criados sem
  convocatória de propósito — o remédio é o rascunho, que já os deixa de fora,
  e não uma janela de tempo.
*/

export interface EventoEmFalta {
  id: string
  titulo: string
  tipo: 'match' | 'gathering'
  data: string
  diasQueFaltam: number
}

/** Os eventos por convocar. Devolve lista vazia a quem não gere. */
export function useEventosSemConvocatoria(ativo: boolean): EventoEmFalta[] {
  const [eventos, setEventos] = useState<EventoEmFalta[]>([])

  useEffect(() => {
    if (!ativo) {
      setEventos([])
      return
    }
    let cancelado = false

    const carregar = async () => {
      const agora = new Date()

      const { data, error } = await supabase
        .from('events')
        .select('id, title, type, date_time, is_active, opponent:opponents(name, initials)')
        .in('type', ['match', 'gathering'])
        .gte('date_time', agora.toISOString())
        .order('date_time', { ascending: true })

      if (cancelado) return
      /*
        Um erro aqui calava a faixa inteira sem deixar rasto, e foi assim que
        passou despercebido durante semanas: `events.is_active` não existia na
        base, o PostgREST recusava a consulta toda por causa de uma coluna no
        `select`, e o alerta nunca aparecia para evento nenhum. A coluna foi
        criada (`supabase_events_is_active_migration.sql`); o erro passa a
        aparecer na consola, que é o mínimo para a próxima se ver.
      */
      if (error) {
        console.error('Erro ao procurar eventos sem convocatória:', error.message)
        return
      }
      if (!data) return

      const candidatos = (data as unknown as {
        id: string
        title: string | null
        type: 'match' | 'gathering'
        date_time: string
        is_active: boolean | null
        opponent: { name: string; initials: string | null } | null
      }[]).filter(e => e.is_active !== false)

      if (candidatos.length === 0) {
        setEventos([])
        return
      }

      // Quais destes já têm alguém convocado. Uma consulta só, e não uma por
      // evento: são poucos, mas a Home abre a cada arranque da app.
      const { data: convocados } = await supabase
        .from('callups')
        .select('event_id')
        .in('event_id', candidatos.map(e => e.id))

      if (cancelado) return
      const comConvocatoria = new Set((convocados ?? []).map(c => (c as { event_id: string }).event_id))

      setEventos(
        candidatos
          .filter(e => !comConvocatoria.has(e.id))
          .map(e => ({
            id: e.id,
            titulo: e.type === 'match'
              ? `Jogo com ${e.opponent?.name ?? 'adversário por definir'}`
              : (e.title || 'Convívio'),
            tipo: e.type,
            data: e.date_time,
            diasQueFaltam: Math.max(
              0,
              Math.ceil((new Date(e.date_time).getTime() - agora.getTime()) / (24 * 60 * 60 * 1000)),
            ),
          })),
      )
    }

    carregar()
    return () => { cancelado = true }
  }, [ativo])

  return eventos
}

/** A faixa na Home (4c). */
export const FaixaSemConvocatoria: React.FC<{
  eventos: EventoEmFalta[]
  aoAbrir: () => void
}> = ({ eventos, aoAbrir }) => {
  if (eventos.length === 0) return null
  const primeiro = eventos[0]

  return (
    <button
      type="button"
      onClick={() => { triggerHaptic('light'); aoAbrir() }}
      className="cartao-simples w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left cursor-pointer
        bg-csc-red/12 border-csc-red/32 transition-transform duration-150 active:scale-97
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
    >
      <TriangleAlert size={17} className="text-csc-vermelho-texto shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-display font-extrabold text-[12.5px] text-white">
          {eventos.length === 1
            ? '1 evento sem convocatória'
            : `${eventos.length} eventos sem convocatória`}
        </span>
        <span className="block text-[10.5px] text-white/60 mt-0.5 truncate">
          {primeiro.titulo} · {primeiro.diasQueFaltam === 0
            ? 'é hoje'
            : primeiro.diasQueFaltam === 1
              ? 'falta 1 dia'
              : `faltam ${primeiro.diasQueFaltam} dias`}
        </span>
      </span>
      <ChevronRight size={16} className="text-white/35 shrink-0" />
    </button>
  )
}

/** A persiana com a lista (4d). */
export const PersianaSemConvocatoria: React.FC<{
  aberto: boolean
  aoFechar: () => void
  eventos: EventoEmFalta[]
}> = ({ aberto, aoFechar, eventos }) => (
  <BottomSheet
    isOpen={aberto}
    onClose={aoFechar}
    title="A precisar de convocatória"
    description="Eventos marcados sem ninguém convocado"
    icon={
      <div className="w-9 h-9 rounded-xl bg-csc-red/20 text-csc-vermelho-texto flex items-center justify-center shrink-0">
        <TriangleAlert size={17} />
      </div>
    }
    footer={
      <>
        <Botao aparencia="vidro" onClick={aoFechar}>Mais tarde</Botao>
        <Link
          to="/calendar"
          onClick={aoFechar}
          className="inline-flex items-center justify-center h-12 px-6 rounded-3xl bg-csc-gold text-csc-tinta
            font-display font-extrabold text-[12.5px] cursor-pointer transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          Ver na Agenda
        </Link>
      </>
    }
  >
    <div className="space-y-2.5">
      {eventos.map(e => {
        const quando = new Date(e.data)
        return (
          <Link
            key={e.id}
            to={`/events?convocatoria=${e.id}`}
            onClick={() => { triggerHaptic('light'); aoFechar() }}
            className="cartao-simples flex items-center gap-3 px-3.5 py-3 cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <span className="w-11 shrink-0 text-center">
              <span className="block font-display font-black text-[17px] text-csc-gold leading-none tabular-nums">
                {quando.getDate()}
              </span>
              <span className="block font-display font-bold text-[8.5px] tracking-[0.1em] uppercase text-white/62 mt-0.5">
                {quando.toLocaleDateString('pt-PT', { weekday: 'short' }).replace(/\.?(-feira)?,?$/, '')}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-display font-extrabold text-[12.5px] text-white truncate">
                {e.titulo}
              </span>
              <span className="block text-[10.5px] text-white/62 mt-0.5">
                {quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {e.diasQueFaltam === 0
                  ? 'é hoje'
                  : e.diasQueFaltam === 1
                    ? 'falta 1 dia'
                    : `faltam ${e.diasQueFaltam} dias`}
              </span>
            </span>

            <span className="font-display font-black text-[11px] text-csc-gold shrink-0">
              Convocar
            </span>
          </Link>
        )
      })}

      <p className="text-[10.5px] leading-relaxed text-white/62 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
        Os treinos não entram aqui — convocam automaticamente todos os aptos, e os rascunhos
        também não. O aviso fica enquanto houver eventos por convocar.
      </p>
    </div>
  </BottomSheet>
)
