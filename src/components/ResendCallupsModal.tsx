import React, { useId } from 'react'
import { RefreshCw, Send, Save } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

/**
 * Ao guardar a edição de um evento já convocado, pergunta se as presenças
 * voltam a Pendente (reenviar o pedido) ou se as respostas já dadas se mantêm.
 *
 * Escape equivale a "Voltar ao formulário", a opção que não decide nada.
 */

export interface ResendCallupsModalProps {
  isOpen: boolean
  /** Guardar e repor todas as presenças como Pendente. */
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
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
            <RefreshCw size={24} className={isSaving ? 'animate-spin' : ''} />
          </div>
          <div>
            <h3 id={tituloId} className="text-base font-black text-gray-900 leading-tight">
              Reenviar Pedidos de Presença?
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Edição de dados do evento
            </p>
          </div>
        </div>

        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-2">
          <p className="font-bold text-gray-900">
            Foram alterados os detalhes deste evento. Desejas reenviar o pedido de confirmação a todos os atletas convocados?
          </p>
          <ul className="space-y-1.5 text-gray-700 text-[11.5px]">
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-600 font-bold shrink-0">✓</span>
              <span><strong className="text-emerald-950">Reenviar Pedidos:</strong> Repõe todas as presenças como <em>Pendente</em> para que os atletas respondam novamente.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-gray-500 font-bold shrink-0">✓</span>
              <span><strong className="text-gray-900">Manter Respostas:</strong> Guarda as alterações do evento mantendo as confirmações já registadas.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={onResend}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <Send size={16} />
            <span>{isSaving ? 'A processar...' : 'Sim, Reenviar Pedidos aos Atletas'}</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onKeepAnswers}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-gray-200 disabled:opacity-50"
          >
            <Save size={16} />
            <span>Não, Apenas Gravar (Manter Respostas)</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onBack}
            className="w-full py-2 text-gray-500 hover:text-gray-800 font-semibold text-xs transition-colors cursor-pointer text-center"
          >
            Voltar ao formulário de edição
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResendCallupsModal
