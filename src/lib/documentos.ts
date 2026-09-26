import { supabase } from './supabaseClient'

/**
 * Os documentos dos atletas: cartão de cidadão, apólice do seguro e atestado
 * médico.
 *
 * **Vivem num bucket privado** (`documentos_atletas`, ver
 * `supabase_documentos_atletas_migration.sql`), numa pasta por ficha:
 * `<profile_id>/<tipo>-<data>.<ext>`. Leem-nos o próprio e a equipa técnica;
 * mais ninguém, nem com o endereço na mão. Até 2026-09-26 iam para o
 * `club_assets`, que é público, e a app guardava o endereço público — o
 * cartão de cidadão de um atleta abria-se sem sessão nenhuma.
 *
 * **Na ficha guarda-se o caminho, e não um endereço.** As colunas
 * (`id_document_url`…) mantêm o nome, mas passam a ter `<profile_id>/cc-….pdf`;
 * para abrir, pede-se um link temporário (`linkTemporario`). Um valor que
 * ainda comece por `http` é um documento antigo, no bucket público, à espera
 * de ser copiado (`migrarDocumentosPublicos`).
 */

export const BUCKET_DOCUMENTOS = 'documentos_atletas'

export type TipoDocumento = 'cc' | 'seguro' | 'atestado'

export type ColunaDocumento = 'id_document_url' | 'insurance_doc_url' | 'medical_exam_doc_url'

export const COLUNA_DO_TIPO: Record<TipoDocumento, ColunaDocumento> = {
  cc: 'id_document_url',
  seguro: 'insurance_doc_url',
  atestado: 'medical_exam_doc_url',
}

export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = ['cc', 'seguro', 'atestado']

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  cc: 'Cartão de cidadão',
  seguro: 'Apólice do seguro',
  atestado: 'Atestado médico',
}

/** Um documento antigo, ainda no bucket público. */
export const eEnderecoPublico = (valor: string) => /^https?:\/\//i.test(valor)

const extensao = (nome: string) => {
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin'
}

/** Carrega um documento para a pasta da ficha e devolve o caminho a guardar. */
export async function carregarDocumento(perfilId: string, tipo: TipoDocumento, ficheiro: File): Promise<string> {
  const caminho = `${perfilId}/${tipo}-${Date.now()}.${extensao(ficheiro.name)}`
  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, ficheiro, { contentType: ficheiro.type || undefined })
  if (error) throw error
  return caminho
}

/**
 * Um link para abrir o documento, válido por uma hora. Um documento antigo
 * devolve o próprio endereço público.
 */
export async function linkTemporario(valor: string, segundos = 3600): Promise<string | null> {
  if (eEnderecoPublico(valor)) return valor
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(valor, segundos)
  if (error || !data) return null
  return data.signedUrl
}

/** O ficheiro em si, para o juntar a um `.zip`. */
export async function descarregarDocumento(valor: string): Promise<Blob> {
  if (eEnderecoPublico(valor)) {
    const resposta = await fetch(valor)
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
    return resposta.blob()
  }
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(valor)
  if (error || !data) throw error ?? new Error('Documento não encontrado')
  return data
}

/** A extensão de um documento guardado, para lhe dar nome dentro do `.zip`. */
export const extensaoDoDocumento = (valor: string) => extensao(valor.split('?')[0].split('/').pop() ?? '')

type PerfilComDocumentos = { id: string } & Partial<Record<ColunaDocumento, string | null>>

let migracaoFeita = false

/**
 * Copia para o bucket privado os documentos que ainda estão no público, e
 * apaga-os de lá.
 *
 * Corre da primeira vez que alguém da equipa técnica abre o Plantel (uma vez
 * por sessão), porque só a app, com a sessão de quem gere, pode ler e escrever
 * nos dois buckets — uma migração em SQL não mexe nos ficheiros. Documento a
 * documento, e por esta ordem: copiar, apontar a ficha para a cópia, e só
 * então apagar o original. Uma falha a meio deixa o documento onde estava, e a
 * próxima abertura tenta outra vez.
 *
 * Devolve quantos documentos passaram.
 */
export async function migrarDocumentosPublicos(perfis: PerfilComDocumentos[]): Promise<number> {
  if (migracaoFeita) return 0
  migracaoFeita = true
  let passaram = 0

  for (const perfil of perfis) {
    for (const tipo of TIPOS_DOCUMENTO) {
      const coluna = COLUNA_DO_TIPO[tipo]
      const valor = perfil[coluna]
      if (!valor || !eEnderecoPublico(valor) || !valor.includes('/club_assets/')) continue
      try {
        const blob = await descarregarDocumento(valor)
        const caminho = `${perfil.id}/${tipo}-${Date.now()}.${extensaoDoDocumento(valor)}`
        const envio = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .upload(caminho, blob, { contentType: blob.type || undefined })
        if (envio.error) throw envio.error

        const ficha = await supabase.from('profiles').update({ [coluna]: caminho }).eq('id', perfil.id)
        if (ficha.error) throw ficha.error

        const original = decodeURIComponent(valor.split('/club_assets/')[1].split('?')[0])
        await supabase.storage.from('club_assets').remove([original])
        passaram++
      } catch (erro) {
        console.error(`Não foi possível passar o documento (${tipo}) da ficha ${perfil.id}:`, erro)
      }
    }
  }
  return passaram
}
