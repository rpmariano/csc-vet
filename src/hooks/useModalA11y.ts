import { useCallback, useEffect, useRef } from 'react'

/**
 * Comportamento de acessibilidade partilhado por todos os modais da app.
 *
 * A app tinha 33 modais escritos à mão e nenhum deles fechava com Escape, prendia
 * o foco ou se anunciava a um leitor de ecrã. Este hook concentra esse
 * comportamento para que qualquer modal — mesmo os que têm visual próprio e não
 * usam o componente <Modal> — o possa adotar com uma linha.
 *
 * Devolve a ref a aplicar ao painel do diálogo. O painel deve levar também
 * `role="dialog"`, `aria-modal="true"` e um nome acessível (`aria-labelledby`
 * apontando ao título, ou `aria-label`).
 *
 *   const painelRef = useModalA11y({ isOpen, onClose })
 *   ...
 *   <div ref={painelRef} role="dialog" aria-modal="true" aria-labelledby={id}>
 */

let modaisAbertos = 0
let overflowGuardado = ''
let paddingGuardado = ''

/**
 * Pilha dos diálogos abertos, do mais antigo ao mais recente. Com modais
 * empilhados (uma confirmação por cima de um formulário, por exemplo) os
 * listeners são todos no `document`: sem isto, um Escape chegava ao de cima e
 * ao de baixo ao mesmo tempo e o Tab era disputado por dois traps. Só o
 * diálogo no topo reage ao teclado.
 */
const pilhaModais: object[] = []

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface OpcoesModalA11y {
  isOpen: boolean
  onClose: () => void
  /** Desligar quando o fecho tiver de ser deliberado (ex.: alterações por guardar). */
  closeOnEscape?: boolean
  /** Desligar em modais que não devem roubar o foco ao abrir. */
  autoFocus?: boolean
}

export function useModalA11y({
  isOpen,
  onClose,
  closeOnEscape = true,
  autoFocus = true,
}: OpcoesModalA11y) {
  const painelRef = useRef<HTMLDivElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  // Identidade estável deste diálogo dentro da pilha.
  const identidade = useRef({})

  // Manter o onClose mais recente sem reinstalar o listener a cada render do pai.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // --- Bloquear o scroll do body, contando os modais empilhados ---
  useEffect(() => {
    if (!isOpen) return

    if (modaisAbertos === 0) {
      overflowGuardado = document.body.style.overflow
      paddingGuardado = document.body.style.paddingRight
      // Compensar a barra de scroll, senão o conteúdo salta para o lado ao abrir.
      const larguraBarra = window.innerWidth - document.documentElement.clientWidth
      if (larguraBarra > 0) document.body.style.paddingRight = `${larguraBarra}px`
      document.body.style.overflow = 'hidden'
    }
    modaisAbertos += 1

    return () => {
      modaisAbertos -= 1
      if (modaisAbertos === 0) {
        document.body.style.overflow = overflowGuardado
        document.body.style.paddingRight = paddingGuardado
      }
    }
  }, [isOpen])

  // --- Manter a pilha de diálogos abertos ---
  useEffect(() => {
    if (!isOpen) return

    const id = identidade.current
    pilhaModais.push(id)

    return () => {
      const i = pilhaModais.lastIndexOf(id)
      if (i !== -1) pilhaModais.splice(i, 1)
    }
  }, [isOpen])

  // --- Escape e prisão do foco dentro do diálogo ---
  const aoPremirTecla = useCallback(
    (e: KeyboardEvent) => {
      // Só o diálogo no topo da pilha responde ao teclado.
      if (pilhaModais[pilhaModais.length - 1] !== identidade.current) return

      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      if (e.key !== 'Tab' || !painelRef.current) return

      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL),
      ).filter(el => el.offsetParent !== null || el === document.activeElement)

      if (focaveis.length === 0) {
        e.preventDefault()
        return
      }

      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      const ativo = document.activeElement

      // Ciclar dentro do diálogo em vez de deixar o foco fugir para a página.
      if (e.shiftKey && (ativo === primeiro || !painelRef.current.contains(ativo))) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    },
    [closeOnEscape],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', aoPremirTecla, true)
    return () => document.removeEventListener('keydown', aoPremirTecla, true)
  }, [isOpen, aoPremirTecla])

  // --- Levar o foco para dentro ao abrir e devolvê-lo ao fechar ---
  useEffect(() => {
    if (!isOpen) return

    focoAnterior.current = document.activeElement as HTMLElement | null

    let t = 0
    if (autoFocus) {
      t = window.setTimeout(() => {
        if (!painelRef.current) return
        const primeiro = painelRef.current.querySelector<HTMLElement>(SELETOR_FOCAVEL)
        // Sem nada focável, focar o painel para que o leitor de ecrã o anuncie.
        ;(primeiro ?? painelRef.current).focus()
      }, 0)
    }

    return () => {
      if (t) window.clearTimeout(t)
      focoAnterior.current?.focus?.()
    }
  }, [isOpen, autoFocus])

  return painelRef
}
