import { dataLocalISO, formatMonthYear, nomeMes, prazoPassou } from '../../lib/finance'
import { MESES_CURTOS, fmtData, fmtEuro } from './estilos'

/**
 * A conta de cada atleta com o clube — o que deve, o que tem a pagamento e o
 * que já pagou —, para o separador "Por atleta" do Financeiro e para o texto
 * que dali se partilha no WhatsApp.
 *
 * As regras são as que o resto da app já usa, e não uma terceira versão:
 *
 * - **Em dívida** é o que passou do prazo. A quota é a que a vista
 *   `v_quota_status` dá como `late`; o encargo é o que tem alguma coisa por
 *   pagar depois do último dia (`prazoPassou`, a regra do separador
 *   Encargos e do sinal de € do cabeçalho).
 * - **A pagamento** é o encargo em aberto ainda dentro do prazo. **As quotas
 *   não entram**: a de março paga-se em março, e pô-la aqui em setembro era
 *   dizer que toda a gente tem sete meses "a pagamento" a época inteira.
 * - **Pago** é o que já entrou: os meses de quota e o que se pagou de cada
 *   encargo. Num encargo pago em parte, a parte paga fica aqui e o resto na
 *   dívida ou a pagamento — cada secção soma as suas linhas, e as três juntas
 *   dão o encargo inteiro.
 */

export type EstadoDaLinha = 'divida' | 'a-pagamento' | 'pago'

/** Os três estados, pela ordem em que se leem: primeiro o que é preciso resolver. */
export const ESTADOS: readonly { chave: EstadoDaLinha; titulo: string }[] = [
  { chave: 'divida', titulo: 'Em dívida' },
  { chave: 'a-pagamento', titulo: 'A pagamento' },
  { chave: 'pago', titulo: 'Pago' },
]

export interface LinhaDeConta {
  chave: string
  origem: 'quota' | 'encargo'
  /** "Quotas", ou a categoria do encargo ("Seguro Desportivo"). */
  categoria: string
  /** "Setembro 2026", ou o título do encargo. */
  descricao: string
  /** O mês a que a linha diz respeito, 'AAAA-MM': o da quota, ou o do prazo do encargo. */
  mes: string | null
  valor: number
  /** 'AAAA-MM-DD' — o último dia para pagar. `null` num encargo sem prazo. */
  prazo: string | null
  /** Só nas pagas: quando entrou (num encargo pago em várias vezes, o último pagamento). */
  pagoEm: string | null
  /** Num encargo pago em parte: quanto já entrou, de quanto. */
  parcial: { pago: number; total: number } | null
}

export interface ContaDoAtleta {
  id: string
  /** O nome das listas — o da camisola, ou o nome. */
  nome: string
  numero: number | null
  linhas: Record<EstadoDaLinha, LinhaDeConta[]>
  totais: Record<EstadoDaLinha, number>
}

export interface DadosDasContas {
  atletas: { id: string; name: string; shirt_name?: string | null; jersey_number?: number | null }[]
  /** Linhas de `v_quota_status`. */
  quotas: {
    player_id: string
    month_year: string
    status: 'paid' | 'late' | 'pending'
    expected_amount: number
    owed_amount: number
    paid_amount: number | null
    due_date: string
    paid_at?: string | null
  }[]
  encargos: { id: string; title: string; amount: number; due_date?: string | null; category_id: string | null }[]
  participacoes: { charge_id: string; player_id: string }[]
  pagamentos: { charge_id: string; player_id: string; amount: number; paid_at: string | null }[]
  categorias: { id: string; name: string }[]
  hoje?: Date
}

const centimos = (n: number) => Math.round(n * 100) / 100
const somar = (valores: number[]) => centimos(valores.reduce((s, v) => s + v, 0))

/** Quotas primeiro, depois as categorias por ordem alfabética; dentro de cada uma, por mês. */
const porCategoriaEMes = (a: LinhaDeConta, b: LinhaDeConta) =>
  (a.origem === b.origem ? 0 : a.origem === 'quota' ? -1 : 1) ||
  a.categoria.localeCompare(b.categoria, 'pt', { sensitivity: 'base' }) ||
  (a.mes ?? '9999-99').localeCompare(b.mes ?? '9999-99') ||
  a.descricao.localeCompare(b.descricao, 'pt', { sensitivity: 'base' })

const semLinhas = (): Record<EstadoDaLinha, LinhaDeConta[]> => ({ divida: [], 'a-pagamento': [], pago: [] })

const comTotais = (
  base: Omit<ContaDoAtleta, 'totais'>,
): ContaDoAtleta => ({
  ...base,
  totais: {
    divida: somar(base.linhas.divida.map(l => l.valor)),
    'a-pagamento': somar(base.linhas['a-pagamento'].map(l => l.valor)),
    pago: somar(base.linhas.pago.map(l => l.valor)),
  },
})

/**
 * A conta de cada atleta que tenha alguma coisa nesta época — quotas ou
 * encargos —, por ordem alfabética.
 */
export function contasDosAtletas(dados: DadosDasContas): ContaDoAtleta[] {
  const hoje = dados.hoje ?? new Date()
  const nomeCategoria = new Map(dados.categorias.map(c => [c.id, c.name]))
  const linhas = new Map<string, Record<EstadoDaLinha, LinhaDeConta[]>>()
  const doAtleta = (id: string) => {
    let l = linhas.get(id)
    if (!l) linhas.set(id, (l = semLinhas()))
    return l
  }

  /* ----------------------------------------------------------- as quotas */
  for (const q of dados.quotas) {
    const conta = doAtleta(q.player_id)
    const base = {
      chave: `quota-${q.month_year}`,
      origem: 'quota' as const,
      categoria: 'Quotas',
      descricao: formatMonthYear(q.month_year),
      mes: q.month_year,
      prazo: q.due_date ? q.due_date.slice(0, 10) : null,
      parcial: null,
    }
    if (q.status === 'paid') {
      conta.pago.push({
        ...base,
        valor: Number(q.paid_amount ?? q.expected_amount),
        pagoEm: q.paid_at ? dataLocalISO(new Date(q.paid_at)) : null,
      })
    } else if (q.status === 'late') {
      conta.divida.push({ ...base, valor: Number(q.owed_amount), pagoEm: null })
    }
    // `pending` não entra: um mês que ainda não chegou ao prazo não se deve.
  }

  /* ---------------------------------------------------------- os encargos */
  const pagoPor = new Map<string, { total: number; ultimo: string | null }>()
  for (const p of dados.pagamentos) {
    const chave = `${p.charge_id}:${p.player_id}`
    const atual = pagoPor.get(chave) ?? { total: 0, ultimo: null }
    const data = p.paid_at ? p.paid_at.slice(0, 10) : null
    pagoPor.set(chave, {
      total: atual.total + Number(p.amount),
      ultimo: data && (!atual.ultimo || data > atual.ultimo) ? data : atual.ultimo,
    })
  }
  const encargoPorId = new Map(dados.encargos.map(e => [e.id, e]))

  for (const { charge_id, player_id } of dados.participacoes) {
    const encargo = encargoPorId.get(charge_id)
    if (!encargo) continue
    const conta = doAtleta(player_id)
    const valor = Number(encargo.amount)
    const pagamento = pagoPor.get(`${charge_id}:${player_id}`)
    const pago = centimos(pagamento?.total ?? 0)
    const emFalta = centimos(valor - pago)
    const prazo = encargo.due_date ? encargo.due_date.slice(0, 10) : null
    const base = {
      origem: 'encargo' as const,
      categoria: (encargo.category_id && nomeCategoria.get(encargo.category_id)) || 'Encargos',
      descricao: encargo.title,
      mes: prazo ? prazo.slice(0, 7) : null,
      prazo,
    }

    if (pago > 0) {
      conta.pago.push({
        ...base,
        chave: `encargo-${encargo.id}-pago`,
        valor: pago,
        pagoEm: pagamento?.ultimo ?? null,
        parcial: emFalta > 0 ? { pago, total: valor } : null,
      })
    }
    if (emFalta > 0) {
      const linha: LinhaDeConta = {
        ...base,
        chave: `encargo-${encargo.id}`,
        valor: emFalta,
        pagoEm: null,
        parcial: pago > 0 ? { pago, total: valor } : null,
      }
      if (prazoPassou(prazo, hoje)) conta.divida.push(linha)
      else conta['a-pagamento'].push(linha)
    }
  }

  /* -------------------------------------------------------------- juntar */
  const contas: ContaDoAtleta[] = []
  for (const atleta of dados.atletas) {
    const l = linhas.get(atleta.id)
    if (!l) continue
    for (const { chave } of ESTADOS) l[chave].sort(porCategoriaEMes)
    contas.push(comTotais({
      id: atleta.id,
      nome: (atleta.shirt_name || atleta.name || 'Atleta').trim(),
      numero: atleta.jersey_number ?? null,
      linhas: l,
    }))
  }
  return contas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }))
}

/** A mesma conta, só com as linhas de uma categoria e/ou de um mês. */
export function filtrarConta(
  conta: ContaDoAtleta,
  { categoria, mes }: { categoria?: string | null; mes?: string | null },
): ContaDoAtleta {
  if (!categoria && !mes) return conta
  const passa = (l: LinhaDeConta) => (!categoria || l.categoria === categoria) && (!mes || l.mes === mes)
  return comTotais({
    ...conta,
    linhas: {
      divida: conta.linhas.divida.filter(passa),
      'a-pagamento': conta.linhas['a-pagamento'].filter(passa),
      pago: conta.linhas.pago.filter(passa),
    },
  })
}

/* ------------------------------------------------------------ as palavras */

/** 'set' — o mês em três letras, minúsculo como se escreve a meio de uma frase. */
const mesCurto = (mes: string) => MESES_CURTOS[Number(mes.slice(5, 7)) - 1].toLowerCase()
/** 'setembro'. */
const mesExtenso = (mes: string) => nomeMes(Number(mes.slice(5, 7))).toLowerCase()
/** '30/09'. */
export const diaEMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** 'Setembro 2026', de 'AAAA-MM' — para os filtros. */
export const nomeDoMes = (mes: string) => formatMonthYear(mes)

/** As linhas de uma categoria juntas, pela ordem em que já vêm. */
const porCategoria = (linhas: LinhaDeConta[]) => {
  const grupos = new Map<string, LinhaDeConta[]>()
  for (const l of linhas) {
    const g = grupos.get(l.categoria) ?? []
    g.push(l)
    grupos.set(l.categoria, g)
  }
  return [...grupos.entries()]
}

/**
 * O que está numa secção, numa linha: "Quotas set, out · Seguro Desportivo".
 * É a letra pequena da lista e o que vai entre parênteses no WhatsApp — o
 * mesmo texto nos dois sítios, para a mensagem dizer o que o ecrã diz.
 *
 * Sem a categoria quando a lista já está filtrada por ela: dentro do filtro
 * "Seguro Desportivo" era repetir o que o título já diz em todas as linhas.
 */
export function resumoDasLinhas(
  linhas: LinhaDeConta[],
  estado: EstadoDaLinha,
  { comCategoria = true }: { comCategoria?: boolean } = {},
): string {
  return porCategoria(linhas)
    .map(([categoria, ls]) => {
      if (ls[0].origem === 'quota') {
        const meses = ls.filter(l => l.mes).map(l => mesCurto(l.mes!)).join(', ')
        return comCategoria ? `Quotas ${meses}` : meses
      }
      const prazos = ls.map(l => l.prazo).filter((p): p is string => !!p).sort()
      const ate = estado === 'a-pagamento' && prazos[0] ? `até ${diaEMes(prazos[0])}` : ''
      return [comCategoria ? categoria : '', ate].filter(Boolean).join(' ')
    })
    .filter(Boolean)
    .join(' · ')
}

/** Uma linha da mensagem de um atleta. As quotas do mesmo estado vão numa só. */
const linhasDaMensagem = (linhas: LinhaDeConta[], estado: EstadoDaLinha): string[] => {
  const quotas = linhas.filter(l => l.origem === 'quota')
  const resultado: string[] = []
  if (quotas.length > 0) {
    const meses = quotas.filter(l => l.mes).map(l => mesExtenso(l.mes!)).join(', ')
    resultado.push(`- Quotas: ${meses} — ${fmtEuro(somar(quotas.map(l => l.valor)))}`)
  }
  for (const l of linhas) {
    if (l.origem === 'quota') continue
    const extra =
      estado === 'pago'
        ? (l.parcial ? ` (de ${fmtEuro(l.parcial.total)})` : '')
        : l.prazo
          ? ` (${estado === 'divida' ? 'prazo' : 'até'} ${diaEMes(l.prazo)})`
          : ''
    resultado.push(`- ${l.descricao} — ${fmtEuro(l.valor)}${extra}`)
  }
  return resultado
}

/**
 * A mensagem com as contas de um atleta, para lhe mandar: o que deve, o que
 * tem a pagamento e o que já pagou. Em texto do WhatsApp — `*negrito*` e
 * listas com hífen, que a app de telemóvel desenha como tal.
 */
export function textoDaConta(
  conta: ContaDoAtleta,
  { clube, hoje = new Date() }: { clube: string; hoje?: Date },
): string {
  const partes = [`*${clube} · ${conta.nome}*`, `Contas a ${fmtData(dataLocalISO(hoje))}`]
  let algum = false
  for (const { chave, titulo } of ESTADOS) {
    const linhas = conta.linhas[chave]
    if (linhas.length === 0) continue
    algum = true
    partes.push('', `*${titulo}: ${fmtEuro(conta.totais[chave])}*`, ...linhasDaMensagem(linhas, chave))
  }
  if (!algum) partes.push('', 'Nada em dívida nem pagamentos nesta época.')
  return partes.join('\n')
}

/**
 * A mensagem com a lista, para o grupo da equipa: uma secção por estado
 * escolhido, e em cada uma quem lá está, quanto e de quê.
 *
 * `contas` já vem filtrada — pela categoria e pelo mês que estiverem
 * escolhidos no ecrã — e `categoria`/`mes` só servem para o título dizer que
 * filtro é, e para as linhas não o repetirem.
 */
export function textoDaLista(
  contas: ContaDoAtleta[],
  {
    clube,
    incluir,
    categoria = null,
    mes = null,
    hoje = new Date(),
  }: {
    clube: string
    incluir: Record<EstadoDaLinha, boolean>
    categoria?: string | null
    mes?: string | null
    hoje?: Date
  },
): string {
  const filtro = [categoria, mes ? nomeDoMes(mes) : null].filter(Boolean).join(' · ')
  const partes = [`*${clube}${filtro ? ` · ${filtro}` : ''}*`, `Contas a ${fmtData(dataLocalISO(hoje))}`]

  for (const { chave, titulo } of ESTADOS) {
    if (!incluir[chave]) continue
    const lista = contas.filter(c => c.linhas[chave].length > 0)
    if (lista.length === 0) {
      // Ninguém em dívida é uma resposta, e das boas — diz-se. Os outros dois
      // vazios não dizem nada a ninguém.
      if (chave === 'divida') partes.push('', `*${titulo}:* ninguém`)
      continue
    }
    const total = somar(lista.map(c => c.totais[chave]))
    partes.push('', `*${titulo}: ${fmtEuro(total)}* (${lista.length} ${lista.length === 1 ? 'atleta' : 'atletas'})`)
    for (const c of lista) {
      const resumo = resumoDasLinhas(c.linhas[chave], chave, { comCategoria: !categoria })
      partes.push(`- ${c.nome} — ${fmtEuro(c.totais[chave])}${resumo ? ` (${resumo})` : ''}`)
    }
  }
  return partes.join('\n')
}

/** O endereço que abre o WhatsApp com a mensagem escrita — no telemóvel, a app; no computador, o WhatsApp Web. */
export const enderecoWhatsApp = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`
