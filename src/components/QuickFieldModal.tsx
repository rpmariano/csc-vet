import React from 'react'
import { X, Plus } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

/**
 * Criação rápida de um campo/instalação sem sair do formulário de evento.
 *
 * Vivia duplicado no Calendário e nos Eventos; a moldura é a mesma dos outros
 * diálogos "rápidos" (cartão branco arredondado, cabeçalho com emoji), por isso
 * usa o hook de acessibilidade em vez do componente <Modal>.
 *
 * Abre sempre por cima do modal de evento — daí o `z-modal-top`.
 */

export interface QuickFieldModalProps {
  isOpen: boolean
  name: string
  address: string
  onNameChange: (valor: string) => void
  onAddressChange: (valor: string) => void
  onSubmit: (e: React.FormEvent) => void
  /** Fecho pedido pelo utilizador (X, Cancelar, Escape ou clique no fundo). */
  onClose: () => void
  isSaving?: boolean
}

export const QuickFieldModal: React.FC<QuickFieldModalProps> = ({
  isOpen,
  name,
  address,
  onNameChange,
  onAddressChange,
  onSubmit,
  onClose,
  isSaving = false,
}) => {
  const painelRef = useModalA11y({ isOpen, onClose })

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-modal-top animate-fade-in"
      onMouseDown={e => {
        // mousedown no fundo, e não um arrasto que começou dentro do painel (ex.: a selecionar texto)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-field-titulo"
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl border border-gray-100 space-y-4 outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
          <div className="w-10 h-10 rounded-xl bg-csc-dark text-csc-gold flex items-center justify-center text-lg font-black shadow-xs" aria-hidden="true">
            🏟️
          </div>
          <div>
            <h3 id="quick-field-titulo" className="text-base font-black text-csc-dark">Criar Novo Campo / Instalação</h3>
            <p className="text-[11px] text-gray-500">Regista um novo campo para ser imediatamente selecionado.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-field-nome">Nome do Campo / Estádio *</label>
            <input
              id="quick-field-nome"
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="Ex: Campo Sintético Municipal de Tires"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-field-morada">Morada / Localização</label>
            <input
              id="quick-field-morada"
              type="text"
              value={address}
              onChange={e => onAddressChange(e.target.value)}
              placeholder="Ex: Av. Amadeu Duarte, Tires, Cascais"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
            />
            <p className="text-[10.5px] text-gray-500 mt-1">Usada para navegação e rotas com Google Maps.</p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-5 py-2 bg-csc-dark hover:bg-black text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Plus size={14} className="text-csc-gold" />
              <span>{isSaving ? 'A guardar...' : 'Guardar & Selecionar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuickFieldModal
