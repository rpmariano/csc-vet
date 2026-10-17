import { supabase } from './supabaseClient'

export interface EquipaOficialDef {
  nome: string
  sigla: string
  campoNome: string
  campoMorada: string
  homeKit1: string
  homeKit2: string | null
  awayKit1: string
  awayKit2: string | null
  grupo: 'Grupo A' | 'Grupo B'
  aliases: string[]
  emblema: string
}

export const EQUIPAS_OFICIAIS: EquipaOficialDef[] = [
  // Grupo A
  {
    nome: 'Janas',
    sigla: 'JAN',
    campoNome: 'Mucifalense',
    campoMorada: 'Rua do Complexo Desportivo nº 24, 2705-249 Colares',
    homeKit1: 'Azul',
    homeKit2: 'Amarelo',
    awayKit1: 'Cinzento',
    awayKit2: 'Amarelo',
    grupo: 'Grupo A',
    aliases: ['janas', 'mucifal'],
    emblema: 'emblemas/janas.png',
  },
  {
    nome: 'DS Private TV',
    sigla: 'DSP',
    campoNome: 'SMD Caneças',
    campoMorada: 'Rua do Campo da Bola - 1685-571 Caneças',
    homeKit1: 'Preto',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['private', 'dsp', 'ds private', 'ds private tv'],
    emblema: 'emblemas/ds-private-torres.png',
  },
  {
    nome: 'Tires',
    sigla: 'TIR',
    campoNome: 'URD Tires',
    campoMorada: 'Rua Campo de Futebol, 2785-609 Tires',
    homeKit1: 'Verde',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['tires', 'urd tires', 'urd'],
    emblema: 'emblemas/urd-tires.png',
  },
  {
    nome: 'Veteranos Sul',
    sigla: 'VSUL',
    campoNome: 'SC Frielas',
    campoMorada: 'Rua Dom Dinis nº8, 2660-032 Frielas',
    homeKit1: 'Azul',
    homeKit2: null,
    awayKit1: 'Vermelho',
    awayKit2: 'Preto',
    grupo: 'Grupo A',
    aliases: ['veteranos', 'vsul', 'vet. sul', 'veteranos sul', 'santa cruz'],
    emblema: 'emblemas/santa-cruz.png',
  },
  {
    nome: 'Melo Falcão',
    sigla: 'MFAL',
    campoNome: 'SL Olivais',
    campoMorada: 'Rua de Chibuto 1, 1800-012 Lisboa',
    homeKit1: 'Verde',
    homeKit2: null,
    awayKit1: 'Amarelo',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['falcao', 'falcão', 'melo', 'melo falcao', 'melo falcão'],
    emblema: 'emblemas/melo-falcao.png',
  },
  {
    nome: 'Lisbon Casuals',
    sigla: 'LCAS',
    campoNome: '9 Abril Trajouce',
    campoMorada: 'Rua Sabino Luis Pedroso, 2785-673 São Domingos Rana',
    homeKit1: 'Azul',
    homeKit2: null,
    awayKit1: 'Amarelo',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['casuals', 'lisbon', 'lisbon casuals', 'lcas'],
    emblema: 'emblemas/lisbon-casuals.png',
  },
  {
    nome: 'Banco Portugal',
    sigla: 'BPOR',
    campoNome: 'SMD Caneças',
    campoMorada: 'Rua do Campo da Bola - 1685-571 Caneças',
    homeKit1: 'Azul',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['banco', 'gdbp', 'bpor', 'banco portugal', 'banco de portugal'],
    emblema: 'emblemas/banco-portugal.png',
  },
  {
    nome: 'Camarate',
    sigla: 'CAM',
    campoNome: 'GD Águias Camarate',
    campoMorada: 'Rua António Custodio Coelho - 2680 Camarate',
    homeKit1: 'Verde',
    homeKit2: 'Branco',
    awayKit1: 'Preto',
    awayKit2: null,
    grupo: 'Grupo A',
    aliases: ['camarate', 'aguias', 'águias', 'gdac', 'gd aguias camarate', 'áuias'],
    emblema: 'emblemas/aguias-camarate.png',
  },

  // Grupo B
  {
    nome: 'Estrelas Lisboa',
    sigla: 'ELIS',
    campoNome: 'SL Olivais',
    campoMorada: 'Rua de Chibuto 1, 1800-012 Lisboa',
    homeKit1: 'Vermelho',
    homeKit2: 'Branco',
    awayKit1: 'Verde',
    awayKit2: 'Preto',
    grupo: 'Grupo B',
    aliases: ['estrelas', 'estrelas lisboa', 'elis'],
    emblema: 'emblemas/estrelas-lisboa.png',
  },
  {
    nome: 'Técnico',
    sigla: 'TEC',
    campoNome: 'SC Frielas',
    campoMorada: 'Rua Dom Dinis nº8, 2660-032 Frielas',
    homeKit1: 'Azul Celeste',
    homeKit2: null,
    awayKit1: 'Azul Escuro',
    awayKit2: null,
    grupo: 'Grupo B',
    aliases: ['tecnico', 'técnico', 'aeist', 'ist', 'tec'],
    emblema: 'emblemas/tecnico.png',
  },
  {
    nome: 'Ferroviário',
    sigla: 'FER',
    campoNome: 'Clube Ferroviário',
    campoMorada: 'Azinhaga dos Alfinetes 144A, Lisboa',
    homeKit1: 'Amarelo',
    homeKit2: 'Azul',
    awayKit1: 'Azul',
    awayKit2: 'Amarelo',
    grupo: 'Grupo B',
    aliases: ['ferroviario', 'ferroviário', 'cfp', 'clube ferroviario', 'ferroviarios'],
    emblema: 'emblemas/ferroviario.png',
  },
  {
    nome: 'Torre',
    sigla: 'TOR',
    campoNome: 'AFD Torre',
    campoMorada: 'Rua das Caravelas, 2750-615 Cascais',
    homeKit1: 'Vermelho',
    homeKit2: null,
    awayKit1: 'Azul',
    awayKit2: null,
    grupo: 'Grupo B',
    aliases: ['torre', 'afd', 'caravelas', 'afd torre', 'torre cascais'],
    emblema: 'emblemas/afd-torre.png',
  },
  {
    nome: 'Bola Cacém',
    sigla: 'BCAC',
    campoNome: 'CD Agualva',
    campoMorada: 'Rua Domingos Borges 18, 2735-359 Agualva',
    homeKit1: 'Branco',
    homeKit2: null,
    awayKit1: 'Azul',
    awayKit2: null,
    grupo: 'Grupo B',
    aliases: ['cacem', 'cacém', 'bola', 'bola cacem', 'bcac', 'zambujeiro'],
    emblema: 'emblemas/zambujeiro.jpg',
  },
  {
    nome: 'Amora',
    sigla: 'AMO',
    campoNome: 'Amora FC',
    campoMorada: 'Estádio da Medideira – Campo nº 2',
    homeKit1: 'Azul',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: 'Cinza',
    grupo: 'Grupo B',
    aliases: ['amora', 'medideira', 'amora fc', 'amo'],
    emblema: 'emblemas/amora.png',
  },
  {
    nome: 'Cascais',
    sigla: 'CSC',
    campoNome: 'GDS Cascais',
    campoMorada: 'Rua da Torre, 2750-148 Cascais',
    homeKit1: 'Verde',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: null,
    grupo: 'Grupo B',
    aliases: ['cascais', 'dramatico', 'dramático', 'csc', 'gds cascais'],
    emblema: 'cascais-emblem.png',
  },
]

function normalizarTexto(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve o URL de um emblema garantindo compatibilidade com o caminho base do Vite/GitHub Pages.
 * Se for uma URL externa (http/https) ou base64 (data:), mantém-na intacta.
 */
export function resolverUrlEmblema(url: string | null | undefined): string {
  if (!url) return ''
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) {
    return u
  }
  const base = import.meta.env.BASE_URL || '/'
  const limpo = u.startsWith('/') ? u.slice(1) : u
  const baseSemBarra = base.replace(/^\/|\/$/g, '')
  if (baseSemBarra && limpo.startsWith(baseSemBarra + '/')) {
    return '/' + limpo
  }
  return base + limpo
}

/**
 * Verifica se um registo da base de dados corresponde à definição de equipa oficial.
 */
export function correspondeEquipaOficial(
  eq: EquipaOficialDef,
  nomeAdversario: string,
  siglaAdversario?: string | null
): boolean {
  const aNorm = normalizarTexto(nomeAdversario)
  const aSigla = (siglaAdversario ?? '').toLowerCase().trim()
  const eqNorm = normalizarTexto(eq.nome)
  const eqSigla = eq.sigla.toLowerCase().trim()

  if (aNorm === eqNorm) return true
  if (aSigla && aSigla === eqSigla) return true

  // Regra específica para a Torre: AFD Torre / Torre Cascais / etc.
  if (eq.nome === 'Torre') {
    const temTorre = aNorm.includes('torre') || aNorm.includes('afd') || aNorm.includes('caravelas')
    const eApenasCascais = aNorm === 'cascais' || aNorm === 'gds cascais' || aNorm === 'cascais sport clube'
    return temTorre && !eApenasCascais
  }

  // Regra específica para Cascais (nosso clube)
  if (eq.nome === 'Cascais') {
    if (aNorm.includes('torre')) return false
    return aNorm.includes('cascais') || aNorm.includes('dramatico')
  }

  // Regra específica para Camarate:
  if (eq.nome === 'Camarate') {
    return aNorm.includes('camarate') || aNorm.includes('aguias') || aNorm.includes('gdac')
  }

  // Regra geral por aliases
  return eq.aliases.some(alias => {
    const alNorm = normalizarTexto(alias)
    return aNorm.includes(alNorm)
  })
}

/**
 * Encontra a definição oficial de uma equipa a partir do seu nome ou sigla.
 */
export function encontrarDefinicaoOficial(nomeOuSigla: string | null | undefined): EquipaOficialDef | null {
  if (!nomeOuSigla) return null
  return EQUIPAS_OFICIAIS.find(eq => correspondeEquipaOficial(eq, nomeOuSigla, nomeOuSigla)) ?? null
}

/**
 * Helper para obter o campo oficial (nome e morada) de uma equipa, caso não esteja associado na BD.
 */
export function obterCampoEquipaOficial(nomeEquipa: string): { nome: string; morada: string } | null {
  const def = encontrarDefinicaoOficial(nomeEquipa)
  if (!def) return null
  return { nome: def.campoNome, morada: def.campoMorada }
}

/**
 * Helper para obter as cores oficiais de equipamentos de uma equipa, caso não estejam preenchidas na BD.
 */
export function obterEquipamentoEquipaOficial(nomeEquipa: string): {
  home1: string
  home2: string | null
  away1: string
  away2: string | null
} | null {
  const def = encontrarDefinicaoOficial(nomeEquipa)
  if (!def) return null
  return {
    home1: def.homeKit1,
    home2: def.homeKit2,
    away1: def.awayKit1,
    away2: def.awayKit2,
  }
}

/**
 * Helper para obter o emblema oficial empacotado na app para uma dada equipa.
 */
export function obterEmblemaEquipaOficial(nomeOuSigla: string | null | undefined): string | null {
  if (!nomeOuSigla) return null
  const def = encontrarDefinicaoOficial(nomeOuSigla)
  if (!def || !def.emblema) return null
  return resolverUrlEmblema(def.emblema)
}

/**
 * Retorna o emblema a usar: ou o logo da base de dados (resolvido com o URL correto)
 * ou o emblema oficial empacotado na app como fallback.
 */
export function obterEmblemaEfetivo(
  logoUrl: string | null | undefined,
  nomeEquipa: string | null | undefined,
  siglaEquipa?: string | null | undefined
): string | null {
  if (logoUrl && logoUrl.trim()) {
    return resolverUrlEmblema(logoUrl)
  }
  return obterEmblemaEquipaOficial(nomeEquipa || siglaEquipa)
}

export interface ResultadoSincronizacao {
  camposAtualizados: number
  equipasAtualizadas: number
  equipasCriadas: number
  detalhes: string[]
}

/**
 * Sincroniza todas as 15 equipas e os 12 campos oficiais diretamente na base de dados Supabase.
 * É 100% idempotente, atualiza todos os registos correspondentes (incluindo duplicados)
 * e garante que nenhuma equipa fica com campo, equipamentos ou emblema a null.
 */
export async function sincronizarEquipasEOficiais(): Promise<ResultadoSincronizacao> {
  const detalhes: string[] = []
  let camposAtualizados = 0
  let equipasAtualizadas = 0
  let equipasCriadas = 0

  // 1. Obter campos existentes
  const { data: camposExistentes, error: errCampos } = await supabase
    .from('fields')
    .select('id, name, address')

  if (errCampos) {
    console.error('Erro ao ler campos:', errCampos)
    throw errCampos
  }

  const mapaCampos = new Map<string, string>() // nomeOficial -> id

  for (const eq of EQUIPAS_OFICIAIS) {
    const nomeNorm = normalizarTexto(eq.campoNome)
    if (mapaCampos.has(nomeNorm)) continue

    // Procurar campo existente por correspondência de nome
    let campo = (camposExistentes ?? []).find(c => {
      const cNorm = normalizarTexto(c.name)
      if (cNorm === nomeNorm) return true

      if (nomeNorm.includes('torre')) {
        const temTorre = cNorm.includes('torre') || cNorm.includes('caravelas') || cNorm.includes('afd')
        const eCascais = cNorm === 'gds cascais' || cNorm === 'cascais'
        return temTorre && !eCascais
      }
      if (nomeNorm.includes('camarate')) {
        return cNorm.includes('camarate') || cNorm.includes('aguias') || cNorm.includes('gdac')
      }
      if (nomeNorm.includes('tires')) return cNorm.includes('tires')
      if (nomeNorm.includes('canecas')) return cNorm.includes('canecas')
      if (nomeNorm.includes('cascais')) return cNorm.includes('cascais') || cNorm.includes('gds')
      if (nomeNorm.includes('amora')) return cNorm.includes('amora') || cNorm.includes('medideira')
      if (nomeNorm.includes('frielas')) return cNorm.includes('frielas')
      if (nomeNorm.includes('olivais')) return cNorm.includes('olivais')
      if (nomeNorm.includes('trajouce')) return cNorm.includes('trajouce') || cNorm.includes('abril')
      if (nomeNorm.includes('agualva')) return cNorm.includes('agualva')
      if (nomeNorm.includes('ferroviario')) return cNorm.includes('ferroviario')
      if (nomeNorm.includes('mucifalense')) return cNorm.includes('mucifalense') || cNorm.includes('mucifal')
      return false
    })

    if (campo) {
      mapaCampos.set(nomeNorm, campo.id)
      if (campo.address !== eq.campoMorada || campo.name !== eq.campoNome) {
        await supabase
          .from('fields')
          .update({ name: eq.campoNome, address: eq.campoMorada })
          .eq('id', campo.id)
        camposAtualizados++
      }
    } else {
      const { data: novoCampo, error: errNovo } = await supabase
        .from('fields')
        .insert({ name: eq.campoNome, address: eq.campoMorada })
        .select('id')
        .single()

      if (!errNovo && novoCampo) {
        mapaCampos.set(nomeNorm, novoCampo.id)
        camposAtualizados++
      }
    }
  }

  // 2. Atualizar campo e emblema de Cascais no club_settings
  const idCampoCascais = mapaCampos.get(normalizarTexto('GDS Cascais'))
  const logoCascais = resolverUrlEmblema('cascais-emblem.png')
  if (idCampoCascais) {
    try {
      await supabase.from('club_settings').update({
        home_field_id: idCampoCascais,
        home_kit_color_1: 'Verde',
        away_kit_color_1: 'Branco',
        logo_url: logoCascais,
      }).eq('id', 1)
    } catch {
      // Ignorar se colunas de club_settings ainda não tiverem sido criadas
    }
  }

  // 3. Obter adversários existentes
  const { data: adversariosExistentes, error: errAdv } = await supabase
    .from('opponents')
    .select('*')

  if (errAdv) {
    console.error('Erro ao ler adversários:', errAdv)
    throw errAdv
  }

  for (const eq of EQUIPAS_OFICIAIS) {
    const campoId = mapaCampos.get(normalizarTexto(eq.campoNome)) ?? null
    const logoUrlOficial = resolverUrlEmblema(eq.emblema)

    const correspondentes = (adversariosExistentes ?? []).filter(a =>
      correspondeEquipaOficial(eq, a.name, a.initials)
    )

    const payload = {
      initials: eq.sigla,
      home_field_id: campoId,
      home_kit_color_1: eq.homeKit1,
      home_kit_color_2: eq.homeKit2,
      away_kit_color_1: eq.awayKit1,
      away_kit_color_2: eq.awayKit2,
    }

    if (correspondentes.length > 0) {
      // Atualizar TODOS os registos correspondentes
      for (const adv of correspondentes) {
        const updatePayload: Record<string, any> = { ...payload }
        // Se não tiver emblema ou se for um caminho inválido, preenche com o oficial
        if (!adv.logo_url) {
          updatePayload.logo_url = logoUrlOficial
        }

        const { error } = await supabase
          .from('opponents')
          .update(updatePayload)
          .eq('id', adv.id)

        if (!error) {
          equipasAtualizadas++
          detalhes.push(`${adv.name}: campo, equipamentos e emblema atualizados`)
        }
      }
    } else {
      // Se não existir adversário para esta equipa oficial, criamos novo registo com emblema
      const { error } = await supabase
        .from('opponents')
        .insert({
          name: eq.nome,
          logo_url: logoUrlOficial,
          ...payload,
        })

      if (!error) {
        equipasCriadas++
        detalhes.push(`${eq.nome}: criada com campo, equipamentos e emblema`)
      }
    }
  }

  return {
    camposAtualizados,
    equipasAtualizadas,
    equipasCriadas,
    detalhes,
  }
}
