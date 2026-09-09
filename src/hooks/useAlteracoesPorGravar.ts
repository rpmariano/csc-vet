import { useCallback, useState } from 'react'
import type { UnsavedChangesModalProps } from '../components/UnsavedChangesModal'

/**
 * O guarda de um formulário: avisa antes de se sair com alterações por gravar.
 *
 * Escreve-se uma vez e usa-se em todos os ecrãs que aceitam dados — a ficha do
 * atleta, o evento, o comunicado, o encargo, a ficha de jogo. Antes o padrão
 * estava copiado em quatro páginas e faltava nas outras onze, e quem fechasse
 * uma persiana a meio de a preencher perdia tudo sem uma palavra.
 *
 * **Sujo é "diferente de como abriu", não "tem alguma coisa escrita".** É a
 * diferença que interessa: as quatro cópias anteriores testavam se algum campo
 * tinha texto, e ao *editar* uma ficha já preenchida isso é sempre verdade —
 * abrir a ficha de um atleta e fechá-la logo dava o aviso de alterações que
 * nunca se fizeram. Aqui compara-se com a fotografia tirada à abertura.
 *
 * Formulários que carregam os dados da rede depois de abrir passam `pronto`:
 * a fotografia espera por eles, senão o próprio carregamento contava como
 * alteração do utilizador.
 */
export interface OpcoesAlteracoesPorGravar {
  /** Se o formulário está aberto. Ao fechar, a fotografia é deitada fora. */
  aberto: boolean
  /**
   * Se os valores iniciais já lá estão. A fotografia é tirada no primeiro
   * render em que `aberto && pronto`. Omitido, conta como pronto à abertura.
   */
  pronto?: boolean
  /** Os valores do formulário, na ordem que se quiser. */
  valores: unknown
  /**
   * Perguntar sempre, mesmo sem nada alterado.
   *
   * É a exceção, e existe para um caso: a edição de um evento já convocado.
   * Gravá-la faz uma segunda pergunta — se reenvia os pedidos de resposta a
   * quem já respondeu —, e sair dela sem querer tem consequências para o
   * plantel inteiro, não só para quem está a editar. O `dialogos.spec.ts`
   * cobre essa decisão; se algum dia se quiser alinhar com o resto da app,
   * tira-se daqui e ajusta-se lá.
   */
  sempre?: boolean
  /** Gravar e sair. É o próprio formulário que fecha, se a gravação correr bem. */
  aoGravar: () => void | Promise<void>
  /** Sair sem gravar: fechar o formulário e limpar o que lá estava. */
  aoSair: () => void
  titulo?: string
  descricao?: string
}

export interface AlteracoesPorGravar {
  /** Se há diferenças em relação a como o formulário abriu. */
  sujo: boolean
  /** Chamar em vez de fechar: ou fecha, ou pergunta primeiro. */
  tentarFechar: () => void
  /**
   * Voltar a tirar a fotografia — para os formulários que ficam abertos depois
   * de gravar (o Perfil, as Definições), senão continuavam sujos para sempre.
   */
  marcarComoGravado: () => void
  /** Passar tal e qual ao `<UnsavedChangesModal {...guarda.props} />`. */
  props: UnsavedChangesModalProps
}

/** A fotografia dos valores. Estável para a mesma forma e ordem. */
const fotografar = (valores: unknown) => {
  try {
    return JSON.stringify(valores) ?? 'null'
  } catch {
    // Um valor que não serialize (um File, uma referência circular) conta
    // sempre como alteração — é o lado seguro: pergunta a mais, nunca a menos.
    return null
  }
}

export function useAlteracoesPorGravar({
  aberto,
  pronto = true,
  valores,
  sempre = false,
  aoGravar,
  aoSair,
  titulo,
  descricao,
}: OpcoesAlteracoesPorGravar): AlteracoesPorGravar {
  const [avisoAberto, setAvisoAberto] = useState(false)
  const [aGravar, setAGravar] = useState(false)

  const agora = fotografar(valores)
  const ativo = aberto && pronto

  /*
    A fotografia é tirada durante o render, e não num efeito: é o padrão que o
    React recomenda para acertar estado quando uma prop muda — a componente
    volta a correr logo, antes de pintar seja o que for, sem o piscar de um
    render intermédio. Numa ref não podia ficar: lê-la durante o render não
    avisa o React de que há mais o que pintar, e `sujo` chegava atrasado uma
    passagem.
  */
  const [fotografia, setFotografia] = useState<{ ativo: boolean; inicial: string | null }>({
    ativo: false,
    inicial: null,
  })
  if (fotografia.ativo !== ativo) {
    setFotografia({ ativo, inicial: ativo ? agora : null })
    if (!aberto && avisoAberto) setAvisoAberto(false)
  }

  const alterado = fotografia.inicial !== null && fotografia.inicial !== agora
  const sujo = ativo && (sempre || alterado)

  const tentarFechar = useCallback(() => {
    if (sujo) setAvisoAberto(true)
    else aoSair()
  }, [sujo, aoSair])

  const marcarComoGravado = useCallback(() => {
    setFotografia({ ativo: true, inicial: fotografar(valores) })
  }, [valores])

  return {
    sujo,
    tentarFechar,
    marcarComoGravado,
    props: {
      isOpen: avisoAberto,
      title: titulo,
      description: descricao,
      isSaving: aGravar,
      onSaveAndExit: async () => {
        setAGravar(true)
        try {
          await aoGravar()
        } finally {
          setAGravar(false)
          setAvisoAberto(false)
        }
      },
      onExitWithoutSaving: () => {
        setAvisoAberto(false)
        aoSair()
      },
      onCancel: () => setAvisoAberto(false),
    },
  }
}
