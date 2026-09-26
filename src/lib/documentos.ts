import { supabase } from './supabaseClient'

/**
 * Os documentos dos atletas: cartão de cidadão, proposta de sócio, apólice do
 * seguro e atestado médico.
 *
 * **Cada documento é uma linha de `documentos_atleta`** (ver
 * `supabase_documentos_por_epoca_migration.sql`), com **até 4 ficheiros** — a
 * frente e o verso do cartão, as páginas da proposta. Os ficheiros vivem no
 * bucket privado `documentos_atletas`, na pasta da ficha:
 * `<profile_id>/<tipo>-<ms>-<n>.<ext>`.
 * Leem-nos o próprio e a equipa técnica; para abrir pede-se um link temporário
 * (`linkTemporario`). Eram três colunas da ficha, uma por documento e para
 * sempre, e a apólice e o atestado renovam-se todas as épocas.
 *
 * **Dois são da pessoa e dois são da época.** O cartão de cidadão e a proposta
 * de sócio são um só por pessoa. A apólice e o atestado são um por época, a do
 * Financeiro (`financial_season()`, `getSeasonLabel()`); os das épocas
 * anteriores ficam guardados, e só a equipa técnica lhes mexe. **Carrega-se só para a época em
 * curso, e quem a decide é o servidor**: o gatilho `documentos_atleta_carimbar`
 * põe a época, a hora e quem carregou, e o cliente não os manda.
 */

export const BUCKET_DOCUMENTOS = 'documentos_atletas'

export type TipoDocumento = 'cc' | 'proposta' | 'seguro' | 'atestado'

export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = ['cc', 'proposta', 'seguro', 'atestado']

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  cc: 'Cartão de cidadão',
  proposta: 'Proposta de sócio',
  seguro: 'Apólice do seguro',
  atestado: 'Atestado médico',
}

/** A apólice e o atestado renovam-se todas as épocas; os outros dois não. */
export const POR_EPOCA: Record<TipoDocumento, boolean> = {
  cc: false,
  proposta: false,
  seguro: true,
  atestado: true,
}

/** Um documento leva até 4 ficheiros. A mesma regra está na tabela. */
export const MAX_FICHEIROS = 4

/** Fotografias, e PDF para quem digitaliza. */
export const TIPOS_DE_FICHEIRO_ACEITES = 'image/*,application/pdf'

export interface DocumentoAtleta {
  id: string
  profile_id: string
  tipo: TipoDocumento
  /** A época ("2026/2027"), só na apólice e no atestado. */
  epoca: string | null
  /** Os ficheiros, 1 a 4, pela ordem em que entraram — caminhos no bucket privado, não endereços. */
  caminhos: string[]
  carregado_em: string
}

export const COLUNAS_DOCUMENTO = 'id, profile_id, tipo, epoca, caminhos, carregado_em'

/** Os documentos de uma pessoa, ou de toda a gente que se pode ler. */
export async function lerDocumentos(perfilId?: string): Promise<DocumentoAtleta[]> {
  let pedido = supabase.from('documentos_atleta').select(COLUNAS_DOCUMENTO)
  if (perfilId) pedido = pedido.eq('profile_id', perfilId)
  const { data, error } = await pedido
  if (error) throw error
  return (data ?? []) as DocumentoAtleta[]
}

/** O documento que vale agora: o único, ou o da época em curso. */
export const documentoEmVigor = (
  documentos: DocumentoAtleta[],
  tipo: TipoDocumento,
  epocaAtual: string,
): DocumentoAtleta | undefined =>
  documentos.find(d => d.tipo === tipo && (!POR_EPOCA[tipo] || d.epoca === epocaAtual))

const extensao = (nome: string) => {
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin'
}

/**
 * Junta ficheiros a um documento — ao único, ou ao desta época —, criando-o se
 * ainda não existe. Quem os limita a 4 é quem chama; a tabela recusa o quinto.
 *
 * Por esta ordem: os ficheiros, e depois a linha. Se a linha falhar, os
 * ficheiros que acabaram de subir saem outra vez — não servem a ninguém.
 */
export async function acrescentarFicheiros(perfilId: string, tipo: TipoDocumento, ficheiros: File[]): Promise<void> {
  const carimbo = Date.now()
  const subidos: string[] = []
  try {
    for (const [i, ficheiro] of ficheiros.entries()) {
      const caminho = `${perfilId}/${tipo}-${carimbo}-${i + 1}.${extensao(ficheiro.name)}`
      const { error } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(caminho, ficheiro, { contentType: ficheiro.type || undefined })
      if (error) throw error
      subidos.push(caminho)
    }
    const { error } = await supabase.rpc('acrescentar_ficheiros', {
      p_perfil: perfilId,
      p_tipo: tipo,
      p_caminhos: subidos,
    })
    if (error) throw error
  } catch (err) {
    if (subidos.length > 0) await supabase.storage.from(BUCKET_DOCUMENTOS).remove(subidos)
    throw err
  }
}

/**
 * Tira um ficheiro do documento e apaga-o do bucket. O último leva o
 * documento com ele.
 */
export async function tirarFicheiro(documento: DocumentoAtleta, caminho: string): Promise<void> {
  const { error } = await supabase.rpc('tirar_ficheiro', { p_documento: documento.id, p_caminho: caminho })
  if (error) throw error
  const { error: erroAoApagar } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho])
  if (erroAoApagar) console.warn(`O ficheiro tirado ficou no bucket (${caminho}):`, erroAoApagar)
}

/** Um link para abrir o documento, válido por uma hora. */
export async function linkTemporario(caminho: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(caminho, segundos)
  if (error || !data) return null
  return data.signedUrl
}

/**
 * O ficheiro em si, para o juntar a um `.zip`: um documento, pelo caminho no
 * bucket privado, ou uma fotografia, pelo endereço público.
 */
export async function descarregarFicheiro(valor: string): Promise<Blob> {
  if (/^https?:\/\//i.test(valor)) {
    const resposta = await fetch(valor)
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
    return resposta.blob()
  }
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(valor)
  if (error || !data) throw error ?? new Error('Documento não encontrado')
  return data
}

/** A extensão de um ficheiro guardado, para lhe dar nome dentro do `.zip`. */
export const extensaoDoFicheiro = (valor: string) => extensao(valor.split('?')[0].split('/').pop() ?? '')

/** "Imagem" ou "PDF" — como se chama um ficheiro de um documento no ecrã. */
export const especieDoFicheiro = (caminho: string) => (extensaoDoFicheiro(caminho) === 'pdf' ? 'PDF' : 'Imagem')
