import React, { createContext, useContext, useState } from 'react'

interface ModoSimplesContextType {
  modoSimples: boolean
  setModoSimples: (ativo: boolean | ((prev: boolean) => boolean)) => void
  alternarModoSimples: () => void
}

const CHAVE_STORAGE = 'csc_modo_simples'

const ModoSimplesContext = createContext<ModoSimplesContextType>({
  modoSimples: false,
  setModoSimples: () => {},
  alternarModoSimples: () => {},
})

export const ModoSimplesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modoSimples, setModoSimplesState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAVE_STORAGE) === 'true'
    } catch {
      return false
    }
  })

  const setModoSimples = (valor: boolean | ((prev: boolean) => boolean)) => {
    setModoSimplesState(prev => {
      const novo = typeof valor === 'function' ? valor(prev) : valor
      try {
        localStorage.setItem(CHAVE_STORAGE, String(novo))
      } catch {}
      return novo
    })
  }

  const alternarModoSimples = () => {
    setModoSimples(prev => !prev)
  }

  return (
    <ModoSimplesContext.Provider value={{ modoSimples, setModoSimples, alternarModoSimples }}>
      {children}
    </ModoSimplesContext.Provider>
  )
}

export const useModoSimples = () => useContext(ModoSimplesContext)
