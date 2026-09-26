import React, { useId } from 'react'
import { RefreshCw, Send, Save } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'
import { Botao } from './ui'

/**
 * Ao guardar a edição de um evento já convocado, pergunta se as respostas
 * voltam a Pendente (reenviar o pedido) ou se as respostas já dadas se mantêm.
 *
 * Escape equivale a "Voltar ao formulário", a opção que não decide nada.
 */

export interface ResendCallupsModalProps {
  isOpen: boolean
  /** Guardar e repor todas as respostas como "sem resposta". */
  onResend: () => void
  /** Guardar mantendo as respostas já registadas. */
  onKeepAnswers: () => void
  /** Voltar ao formulário de edição sem guardar. */
  onBack: () => void
  isSaving?: boolean
}

export const ResendCallupsModal: React.FC<ResendCallupsModalProps> = ({
  isOpen,
  onResend,
  onKeepAnswers,
  onBack,
  isSaving = false,
}) => {
  const painelRef = useModalA11y({ isOpen, onClose: onBack })
  const tituloId = useId()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal-confirm animate-fade-in select-none">
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="bg-csc-superficie rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white/10 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-csc-gold/15 text-csc-gold flex items-center justify-center shrink-0 shadow-2xs">
            <RefreshCw size={24} className={isSaving ? 'animate-spin' : ''} />
          </div>
          <div>
            <h3 id={tituloId} className="text-base font-black text-white leading-tight">
              Reenviar o pedido de resposta?
            </h3>
            <p className="text-xs text-white/62 mt-0.5">
              Edição de dados do evento
            </p>
          </div>
        </div>

        <div className="bg-csc-gold/10 border border-csc-gold/25 rounded-2xl p-4 text-xs text-csc-gold space-y-2">
          <p className="font-bold text-white">
            Foram alterados os detalhes deste evento. Queres reenviar o pedido de confirmação a todos os atletas convocados?
          </p>
          <ul className="space-y-1.5 text-white/80 text-[11.5px]">
            <li className="flex items-start gap-1.5">
              <span className="text-csc-light font-bold shrink-0">✓</span>
              <span><strong className="text-csc-verde-texto">Reenviar:</strong> Repõe todas as respostas como <em>Sem resposta</em>, para os convocados responderem de novo.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-white/62 font-bold shrink-0">✓</span>
              <span><strong className="text-white">Só guardar:</strong> Guarda as alterações do evento mantendo as confirmações já registadas.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-2.5 pt-1">
          <Botao largo aparencia="verde" disabled={isSaving} onClick={onResend}>
            <Send size={16} aria-hidden="true" />
            {isSaving ? 'A processar…' : 'Sim, reenviar os pedidos'}
          </Botao>
          <Botao largo aparencia="vidro" disabled={isSaving} onClick={onKeepAnswers}>
            <Save size={16} aria-hidden="true" />
            Não, só guardar
          </Botao>
          <Botao largo aparencia="vidro" disabled={isSaving} onClick={onBack}>
            Voltar ao formulário
          </Botao>
        </div>
      </div>
    </div>
  )
}

export default ResendCallupsModal
