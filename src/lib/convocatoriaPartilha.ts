import { enderecoEvento } from './rotas'
import { localDoEvento } from './eventos'
import { triggerHaptic } from '../utils/haptics'
import { toast } from '../context/ToastContext'
import { CLUBE_SIGLA } from './clube'
import { obterJogoAntecedidoPeloTreino } from './disponibilidadeJogo'

export interface EventoPartilha {
  id: string
  title: string
  type: string
  date_time: string
  meeting_time?: string | null
  field_id?: string | null
  location?: string | null
  field?: { name: string; address?: string | null } | null
  is_friendly?: boolean | null
  home_away?: string | null
  opponent_id?: string | null
  opponent?: { name: string; initials?: string | null } | null
  is_active?: boolean | null
}

export interface OpcoesPartilha {
  adversarioNome?: string | null
  adversarioSigla?: string | null
  clubeNome?: string | null
  clubeSigla?: string | null
  campos?: readonly { id: string; name: string; address?: string | null }[]
  todosEventos?: readonly EventoPartilha[]
  jogoAntecedido?: EventoPartilha | null
}

/** Endereço para abrir o WhatsApp com mensagem pré-preenchida. */
export const enderecoWhatsApp = (texto: string): string =>
  `https://wa.me/?text=${encodeURIComponent(texto)}`

/** Constrói o texto formatado para partilha da convocatória no WhatsApp. */
export function textoConvocatoriaWhatsApp(
  evento: EventoPartilha,
  opcoes?: OpcoesPartilha,
): string {
  const url = enderecoEvento(evento.id)
  const d = new Date(evento.date_time)

  // Ex: "Sábado, 11 de Outubro às 15:30"
  const dataFormatada = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const dataCapitalizada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)
  const horaFormatada = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

  let tituloEvento = evento.title
  if (evento.type === 'match') {
    const csc = opcoes?.clubeSigla || CLUBE_SIGLA
    const opp = opcoes?.adversarioSigla || opcoes?.adversarioNome || evento.opponent?.initials || evento.opponent?.name
    if (opp) {
      tituloEvento = evento.home_away === 'away' ? `${opp} vs ${csc}` : `${csc} vs ${opp}`
    } else {
      tituloEvento = evento.title || 'Jogo'
    }
  } else if (evento.type === 'practice') {
    tituloEvento = 'Treino'
  } else if (evento.type === 'gathering') {
    tituloEvento = evento.title || 'Convívio'
  }

  const { nome: localNome } = localDoEvento(evento, opcoes?.campos || [])

  const linhas: string[] = [
    `📋 *Convocatória — ${opcoes?.clubeNome || opcoes?.clubeSigla || CLUBE_SIGLA}*`,
    `⚽ *${tituloEvento}*`,
    `📅 ${dataCapitalizada} às ${horaFormatada}`,
  ]

  if (evento.meeting_time) {
    linhas.push(`⏰ Concentração: ${evento.meeting_time.substring(0, 5)}`)
  }

  if (localNome) {
    linhas.push(`📍 Local: ${localNome}`)
  }

  // Se for um treino e anteceder um jogo antes do próximo treino:
  // acoplar a sondagem com os dados do jogo (data, hora, local) e a questão da disponibilidade
  const jogoAntecedido = evento.type === 'practice'
    ? (opcoes?.jogoAntecedido ?? (opcoes?.todosEventos ? obterJogoAntecedidoPeloTreino(evento, opcoes.todosEventos) : null))
    : null

  if (jogoAntecedido) {
    const dJogo = new Date(jogoAntecedido.date_time)
    const dataJogoFormatada = dJogo.toLocaleDateString('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const dataJogoCap = dataJogoFormatada.charAt(0).toUpperCase() + dataJogoFormatada.slice(1)
    const horaJogoFormatada = dJogo.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

    const csc = opcoes?.clubeSigla || CLUBE_SIGLA
    const opp = jogoAntecedido.opponent?.initials || jogoAntecedido.opponent?.name || 'Adversário'
    const confronto = jogoAntecedido.home_away === 'away' ? `${opp} vs ${csc}` : `${csc} vs ${opp}`

    const { nome: localJogoNome } = localDoEvento(jogoAntecedido, opcoes?.campos || [])

    linhas.push('')
    linhas.push('━━━━━━━━━━━━━━━━━━━━━')
    linhas.push('🏆 *SONDAGEM: PRÓXIMO JOGO*')
    linhas.push(`⚽ *${confronto}*`)
    linhas.push(`📅 ${dataJogoCap} às ${horaJogoFormatada}`)
    if (jogoAntecedido.meeting_time) {
      linhas.push(`⏰ Concentração: ${jogoAntecedido.meeting_time.substring(0, 5)}`)
    }
    if (localJogoNome) {
      linhas.push(`📍 Local: ${localJogoNome}`)
    }
    linhas.push('')
    linhas.push('❓ *Estás disponível para ser convocado para este jogo?*')
    linhas.push('1️⃣ Sim, disponível')
    linhas.push('2️⃣ Não disponível')
    linhas.push('━━━━━━━━━━━━━━━━━━━━━')
  }

  linhas.push('')
  linhas.push(
    jogoAntecedido
      ? 'Confirma a presença no treino e disponibilidade para o jogo na app:'
      : 'Confirma a tua disponibilidade na app:',
  )
  linhas.push(url)

  return linhas.join('\n')
}

/** Copia o link direto do evento para a área de transferência. */
export async function copiarLinkConvocatoria(idEvento: string): Promise<boolean> {
  const url = enderecoEvento(idEvento)
  triggerHaptic('light')
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      toast.success('Link da convocatória copiado!')
      return true
    }
    throw new Error('Sem suporte para área de transferência')
  } catch {
    toast.error('Não foi possível copiar o link.')
    return false
  }
}

/** Abre o WhatsApp com a mensagem formatada da convocatória. */
export function partilharConvocatoriaWhatsApp(
  evento: EventoPartilha,
  opcoes?: OpcoesPartilha,
): void {
  triggerHaptic('light')
  const texto = textoConvocatoriaWhatsApp(evento, opcoes)
  window.open(enderecoWhatsApp(texto), '_blank', 'noopener,noreferrer')
}
