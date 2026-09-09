import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'

/**
 * O guarda de saída dos formulários que ocupam o ecrã inteiro.
 *
 * Um diálogo fecha-se por um botão, e aí o `useAlteracoesPorGravar` chega: o
 * formulário sabe quando lhe pedem para fechar. Mas o Perfil, os comunicados
 * por publicar e as definições financeiras não se fecham — sai-se deles a
 * navegar, e a página nem dá por isso.
 *
 * Então a página **regista-se** aqui com o seu estado (`sujo`, como gravar,
 * como descartar), e quem navega — a barra de baixo, a folha do [+], o
 * cabeçalho — pergunta primeiro por `pedirSaida()`. Se houver alterações por
 * gravar, a navegação fica pendente e aparece o mesmo aviso de sempre.
 *
 * **O que isto não apanha é o retroceder do browser.** Bloquear o `popstate`
 * obriga a empurrar entradas no histórico à mão, e o histórico desta app já é
 * delicado — é dele que dependem as persianas de detalhe (`?event=`,
 * `?atleta=`), com uma corrida conhecida por fechar. Cobrir o botão de
 * retroceder é mudar as rotas para um data router e usar o `useBlocker` do
 * React Router; até lá, o que se faz é não perder o trabalho por um toque na
 * barra de navegação, que é como se sai destes ecrãs quase sempre.
 */

export interface RegistoDeSaida {
  /** Se há alterações por gravar neste momento. */
  sujo: boolean
  /** Gravar. A navegação só segue se isto resolver sem lançar. */
  gravar: () => void | Promise<void>
  /** Descartar o que está por gravar — repor o formulário como estava. */
  descartar?: () => void
  descricao?: string
}

interface ValorContexto {
  /** A página regista-se (ou desregista-se, com `null`). */
  registar: (registo: RegistoDeSaida | null) => void
  /**
   * Perguntar antes de navegar. Devolve `true` se pode seguir já; `false` se
   * ficou pendente à espera da resposta ao aviso — nesse caso quem chamou tem
   * de cancelar a navegação (`e.preventDefault()`).
   */
  pedirSaida: (prosseguir: () => void) => boolean
}

const Contexto = createContext<ValorContexto>({
  registar: () => {},
  pedirSaida: prosseguir => { prosseguir(); return true },
})

export const SaidaGuardadaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /*
    Numa ref e não em estado: o registo muda a cada tecla que se escreve no
    formulário, e pô-lo em estado repintaria a app inteira a cada letra. Só é
    lido em callbacks — nunca durante o render —, que é exatamente para o que
    uma ref serve.
  */
  const registo = useRef<RegistoDeSaida | null>(null)
  /* A navegação à espera de resposta, e o texto que o aviso vai mostrar — o
     texto vem para aqui porque durante o render não se lê uma ref. */
  const [pendente, setPendente] = useState<{ seguir: () => void; descricao?: string } | null>(null)
  const [aGravar, setAGravar] = useState(false)

  const registar = useCallback((novo: RegistoDeSaida | null) => {
    registo.current = novo
  }, [])

  const pedirSaida = useCallback((prosseguir: () => void) => {
    if (!registo.current?.sujo) {
      prosseguir()
      return true
    }
    setPendente({ seguir: prosseguir, descricao: registo.current.descricao })
    return false
  }, [])

  /*
    Fechar o separador ou recarregar não passa pelo router — só o browser é que
    pode perguntar, e só se a página disser que tem trabalho por gravar.
  */
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (registo.current?.sujo) e.preventDefault()
    }
    window.addEventListener('beforeunload', aoSair)
    return () => window.removeEventListener('beforeunload', aoSair)
  }, [])

  return (
    <Contexto.Provider value={{ registar, pedirSaida }}>
      {children}
      <UnsavedChangesModal
        isOpen={pendente !== null}
        description={pendente?.descricao}
        isSaving={aGravar}
        onSaveAndExit={async () => {
          const seguir = pendente?.seguir
          setAGravar(true)
          try {
            await registo.current?.gravar()
            registo.current = null
            setPendente(null)
            seguir?.()
          } finally {
            setAGravar(false)
          }
        }}
        onExitWithoutSaving={() => {
          const seguir = pendente?.seguir
          registo.current?.descartar?.()
          registo.current = null
          setPendente(null)
          seguir?.()
        }}
        onCancel={() => setPendente(null)}
      />
    </Contexto.Provider>
  )
}

/** Quem navega: `if (!pedirSaida(seguir)) e.preventDefault()`. */
export const useSaidaGuardada = () => useContext(Contexto)

/**
 * A página que tem um formulário sempre presente regista-se com isto.
 * Desregista-se sozinha ao sair, para a página seguinte não herdar o guarda.
 */
export const useGuardaDeSaida = (registo: RegistoDeSaida) => {
  const { registar } = useSaidaGuardada()
  const { sujo, gravar, descartar, descricao } = registo
  useEffect(() => {
    registar({ sujo, gravar, descartar, descricao })
    return () => registar(null)
  }, [registar, sujo, gravar, descartar, descricao])
}
