/**
 * As regras de um evento que o resto da app precisa de saber: como se chama um
 * atleta, até quando se responde a uma convocatória, quando é que ela fecha.
 *
 * Viviam na `CalendarPage`, e por isso metade da app importava uma página de
 * 3000 linhas para saber se um jogo já tinha ficha lançada. É a mesma mudança
 * que as siglas fizeram: uma página não é sítio para guardar regras.
 * A `CalendarPage` continua a exportá-las para quem já as importava de lá.
 */

export const getPlayerDisplayName = (player?: { name?: string; shirt_name?: string | null; nickname?: string | null } | null): string => {
  if (!player) return 'Atleta'
  const shirt = player.shirt_name?.trim()
  if (shirt) return shirt
  const nick = player.nickname?.trim()
  if (nick) return nick
  return player.name || 'Atleta'
}

export const getGoogleMapsUrl = (query: string) => query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '#'

/**
 * Onde é o evento: o nome do sítio e a morada, separados.
 *
 * **Uma precedência só, e é o campo que ganha.** O cartão da Agenda dava
 * precedência ao `location` escrito à mão e devolvia a morada vazia; a
 * persiana do mesmo evento fazia o contrário. Com os dois preenchidos — que é
 * o estado normal de uma ficha editada — o cartão dizia um sítio e a persiana
 * dizia outro, e esta é a única informação deste ecrã que, errada, leva alguém
 * a conduzir para o lado errado.
 *
 * O campo ganha porque é o registo do clube, com morada; o `location` é a
 * exceção, para eventos que não têm campo na base — um jantar, um torneio fora.
 */
export function localDoEvento(
  ev?: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null,
  campos: readonly { id: string; name: string; address?: string | null }[] = [],
): { nome: string; morada: string } {
  if (!ev) return { nome: '', morada: '' }
  const campo = ev.field ?? (ev.field_id ? campos.find(c => c.id === ev.field_id) ?? null : null)
  if (campo?.name) return { nome: campo.name, morada: campo.address?.trim() || '' }
  const solto = ev.location?.trim()
  if (solto) return { nome: solto, morada: '' }
  return { nome: '', morada: '' }
}

/**
 * Um jogo com ficha de jogo lançada (resultado gravado) fica "fechado": os jogadores já
 * não podem responder à convocatória e o evento deixa de poder ser editado ou apagado
 * — a ficha e as estatísticas associadas já dependem daquele estado do evento.
 */
export const hasMatchReport = (ev?: { type?: string; home_score?: number | null } | null): boolean =>
  !!ev && ev.type === 'match' && ev.home_score !== null && ev.home_score !== undefined

/**
 * Prazo até ao qual o jogador pode responder — ou mudar de ideias sobre uma resposta já
 * dada — à convocatória: a hora de concentração, ou o início do evento quando não há
 * concentração definida. Depois disso a resposta fica fechada (só consulta).
 */
export const getRsvpDeadline = (ev?: { date_time?: string | null; meeting_time?: string | null } | null): number | null => {
  if (!ev?.date_time) return null
  const prazo = new Date(ev.date_time)
  if (ev.meeting_time) {
    const [hh, mm, ss] = ev.meeting_time.split(':').map(Number)
    prazo.setHours(hh || 0, mm || 0, ss || 0, 0)
  }
  return prazo.getTime()
}

/** Dias de antecedência com que a convocatória de um treino abre. */
export const DIAS_JANELA_TREINO = 6

/**
 * Porque é que a convocatória de um evento não aceita respostas — ou `null`
 * quando aceita.
 *
 * A regra é uma só e vive aqui, porque estava escrita por extenso em quatro
 * sítios (o cartão da Agenda, a persiana do evento, o guarda do
 * `handleCallupResponse` e a Home) e já divergia entre eles.
 *
 * **Tudo se responde, treinos incluídos**, assim que o evento deixa de ser
 * rascunho e tem gente convocada. Sem convocatória feita não há a quem
 * perguntar; em rascunho o evento ainda é da equipa técnica.
 *
 * **O treino tem janela**: abre `DIAS_JANELA_TREINO` dias antes e fecha à hora
 * a que se realiza — não à de concentração, como os outros. São semanais e
 * convocam automaticamente todos os aptos: sem janela, a lista tinha sempre um
 * treino por responder, e a pergunta perdia o efeito antes de chegar a ser
 * útil. Fora da janela não é "fechada", é "ainda não abriu" — e o texto
 * di-lo, para ninguém pensar que perdeu o prazo.
 *
 * E qualquer um fecha quando a ficha de jogo é lançada — as estatísticas já
 * dependem daquele estado — ou quando passa a hora limite.
 */
export type ConvocatoriaFechada =
  | 'rascunho'
  | 'sem-convocados'
  | 'ficha-lancada'
  | 'ainda-nao-abriu'
  | 'passou-a-hora'

export function convocatoriaFechada(
  ev?: {
    type?: string
    date_time?: string | null
    meeting_time?: string | null
    home_score?: number | null
    is_active?: boolean | null
  } | null,
  temConvocados = true,
): ConvocatoriaFechada | null {
  if (!ev) return 'sem-convocados'
  if (ev.is_active === false) return 'rascunho'
  if (!temConvocados) return 'sem-convocados'
  if (hasMatchReport(ev)) return 'ficha-lancada'

  if (ev.type === 'practice') {
    if (!ev.date_time) return null
    const comeca = new Date(ev.date_time).getTime()
    const agora = Date.now()
    if (agora >= comeca) return 'passou-a-hora'
    if (comeca - agora > DIAS_JANELA_TREINO * 864e5) return 'ainda-nao-abriu'
    return null
  }

  const prazo = getRsvpDeadline(ev)
  if (prazo !== null && Date.now() >= prazo) return 'passou-a-hora'
  return null
}

/**
 * "Responde até sexta, 21h00" — o prazo, escrito para quem tem de responder.
 *
 * Existe porque ao lado da pergunta estava a contagem de confirmados, e numa
 * base com 0,7% de respostas isso é "0 confirmados" colado a "Contamos
 * contigo?": prova de que ninguém responde, no exato momento em que se pede
 * que se responda. O prazo é o que falta ali — a app sabia-o (é o mesmo valor
 * que fecha a convocatória) e nunca o dizia a ninguém.
 *
 * Devolve `null` quando não há prazo a anunciar: sem data, ou com a hora já
 * passada, que é caso para o texto de convocatória fechada e não para este.
 */
export function textoPrazoResposta(
  ev?: { type?: string; date_time?: string | null; meeting_time?: string | null } | null,
  agora = new Date(),
): string | null {
  if (!ev?.date_time) return null

  /* O treino fecha à hora a que começa, e não à de concentração — é a mesma
     distinção que a `convocatoriaFechada()` faz. */
  const prazo = ev.type === 'practice'
    ? new Date(ev.date_time).getTime()
    : getRsvpDeadline(ev)
  if (prazo === null || prazo <= agora.getTime()) return null

  const data = new Date(prazo)
  const horas = `${String(data.getHours()).padStart(2, '0')}h${String(data.getMinutes()).padStart(2, '0')}`

  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diasDeDiferenca = Math.round((dia(data) - dia(agora)) / 864e5)

  if (diasDeDiferenca === 0) return `Responde até hoje, ${horas}`
  if (diasDeDiferenca === 1) return `Responde até amanhã, ${horas}`
  /* Dentro da semana o dia da semana situa melhor do que a data; passada
     essa, "sexta" podia ser a de daqui a três semanas. */
  if (diasDeDiferenca < 7) {
    const semana = data.toLocaleDateString('pt-PT', { weekday: 'long' }).replace(/-feira$/, '')
    return `Responde até ${semana}, ${horas}`
  }
  const curta = data.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
  return `Responde até ${curta}, ${horas}`
}

/** A frase a mostrar no lugar dos botões. */
export function textoConvocatoriaFechada(
  motivo: ConvocatoriaFechada,
  ev?: { type?: string; meeting_time?: string | null } | null,
): string {
  switch (motivo) {
    case 'rascunho':
      return 'Em rascunho — a convocatória abre quando o evento for publicado'
    case 'sem-convocados':
      return 'Convocatória por fazer'
    case 'ficha-lancada':
      return 'Jogo com ficha lançada — convocatória fechada'
    case 'ainda-nao-abriu':
      return `A resposta abre ${DIAS_JANELA_TREINO} dias antes do treino`
    case 'passou-a-hora':
      return ev?.type === 'practice'
        ? 'Convocatória fechada — o treino já começou'
        : `Convocatória fechada — já passou a hora de ${ev?.meeting_time ? 'concentração' : 'início'}`
  }
}

/**
 * A data no cartão da Agenda: "QUARTA, 16/09".
 *
 * O cartão mostrava a hora e nunca o dia — a data só existia no `aria-label`,
 * portanto lia-se "18:00" sem saber de quando. Numa lista que percorre o mês
 * inteiro, é a informação que mais falta.
 *
 * O `weekday: 'short'` em pt-PT dá "quarta" e não "qua", e o `month: 'short'`
 * acaba em "16/09" — verificado, não suposto. Fica assim: o dia da semana por
 * extenso é o que se lê primeiro numa agenda, e o resto cabe em cinco
 * caracteres.
 */
const DATA_CURTA = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** "quarta, 16/09" → "QUARTA, 16/09". O `replace` tira o ponto de abreviaturas. */
export const formatDataCurta = (iso: string): string =>
  DATA_CURTA.format(new Date(iso)).replace(/\./g, '').toUpperCase()

/* As siglas mudaram-se para `src/lib/siglas.ts` — a Home também precisa
   delas, e uma página não é sítio para as guardar. Continuam a sair daqui
   para quem já as importava. */
