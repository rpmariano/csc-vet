import React, { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, X, Check, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSModal, setShowIOSModal] = useState(false)
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('csc_pwa_banner_dismissed') === 'true'
  })

  useEffect(() => {
    // Check if already installed / in standalone mode
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    setIsStandalone(isStandaloneMode)

    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream
    setIsIOS(isIosDevice)

    // Listen for beforeinstallprompt on Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsStandalone(true)
      setDeferredPrompt(null)
      setShowIOSModal(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else if (isIOS) {
      setShowIOSModal(true)
    } else {
      // For desktop or browsers without native prompt, show instructions or open modal
      setShowIOSModal(true)
    }
  }

  const handleDismissBanner = () => {
    setIsBannerDismissed(true)
    localStorage.setItem('csc_pwa_banner_dismissed', 'true')
  }

  if (isStandalone) {
    return null
  }

  return (
    <>
      {/* Banner Flutuante de Instalação na parte inferior do ecrã (se não tiver sido dispensado) */}
      {!isBannerDismissed && (
        <div className="fixed bottom-18 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-md bg-gradient-to-r from-csc-dark to-emerald-950 text-white p-3.5 rounded-2xl shadow-2xl border-2 border-csc-gold z-50 animate-bounce-short">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img 
                src="/csc-vet/pwa-192x192.png" 
                alt="CSC Emblem" 
                className="w-10 h-10 rounded-xl bg-white p-1 shadow-md shrink-0 border border-csc-gold"
              />
              <div className="min-w-0">
                <p className="text-xs font-black text-white leading-tight">Instalar App CSC</p>
                <p className="text-[10.5px] text-gray-300 truncate">Adicione ao ecrã inicial para acesso rápido e offline.</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="bg-csc-gold hover:bg-amber-400 text-csc-dark font-black text-xs px-3 py-1.5 rounded-xl shadow-sm transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>Instalar</span>
              </button>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal com Instruções de Instalação (para iOS / outros browsers) */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-gray-900 shadow-2xl relative border-2 border-csc-gold">
            <button
              onClick={() => setShowIOSModal(false)}
              aria-label="Fechar"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-white p-2 mx-auto mb-3 shadow-md border border-gray-200 flex items-center justify-center">
                <img src="/csc-vet/pwa-192x192.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h3 className="text-lg font-black text-csc-dark">Instalar App nos Veteranos</h3>
              <p className="text-xs text-gray-500 mt-1">Siga os passos simples abaixo para adicionar a app ao seu telemóvel:</p>
            </div>

            {isIOS ? (
              <div className="space-y-3.5 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-700">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <p className="leading-snug">
                    Toque no botão <strong className="text-blue-600 inline-flex items-center gap-1 font-bold"><Share size={13} /> Partilhar</strong> na barra do Safari (ao fundo do ecrã).
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <p className="leading-snug">
                    Deslize para baixo e selecione <strong className="text-gray-900 inline-flex items-center gap-1 font-bold"><PlusSquare size={13} /> Ecrã Principal</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                  <p className="leading-snug">
                    Toque em <strong className="text-csc-dark font-bold">Adicionar</strong> no canto superior direito.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-700">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <p className="leading-snug">
                    No menu do navegador (três pontos <strong>⋮</strong> no canto superior), selecione <strong>"Instalar aplicação"</strong> ou <strong>"Adicionar ao ecrã principal"</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <p className="leading-snug">
                    Confirme a instalação para ter o ícone oficial do CSC no seu ecrã!
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full py-3 bg-csc-dark text-white rounded-xl font-black text-xs hover:bg-csc-dark/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check size={16} className="text-csc-gold" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Botão para o Menu Principal
export const PWAInstallMenuItem: React.FC<{ onClickExtra?: () => void }> = ({ onClickExtra }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true

    setIsStandalone(isStandaloneMode)

    const userAgent = window.navigator.userAgent.toLowerCase()
    setIsIOS(/iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream)

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsStandalone(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (isStandalone) return null

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
      if (onClickExtra) onClickExtra()
    } else {
      setShowModal(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-black text-xs text-csc-gold bg-black/40 hover:bg-black/60 border border-csc-gold/40 transition-all cursor-pointer shadow-xs my-2"
      >
        <div className="flex items-center gap-2.5">
          <Smartphone size={16} className="text-csc-gold" />
          <span>Instalar App no Telemóvel</span>
        </div>
        <Download size={14} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-gray-900 shadow-2xl relative border-2 border-csc-gold">
            <button
              onClick={() => setShowModal(false)}
              aria-label="Fechar"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-white p-2 mx-auto mb-3 shadow-md border border-gray-200 flex items-center justify-center">
                <img src="/csc-vet/pwa-192x192.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h3 className="text-lg font-black text-csc-dark">Instalar App CSC</h3>
              <p className="text-xs text-gray-500 mt-1">Como instalar a app no seu dispositivo:</p>
            </div>

            {isIOS ? (
              <div className="space-y-3.5 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-700">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <p className="leading-snug">
                    No Safari, toque no botão <strong className="text-blue-600 inline-flex items-center gap-1 font-bold"><Share size={13} /> Partilhar</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <p className="leading-snug">
                    Selecione a opção <strong className="text-gray-900 inline-flex items-center gap-1 font-bold"><PlusSquare size={13} /> Adicionar ao Ecrã Principal</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                  <p className="leading-snug">
                    Toque em <strong className="text-csc-dark font-bold">Adicionar</strong> no topo direito.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs font-semibold text-gray-700">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <p className="leading-snug">
                    Toque no menu do navegador (três pontos <strong>⋮</strong> no topo direito).
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-csc-dark text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <p className="leading-snug">
                    Selecione <strong>"Instalar aplicação"</strong> ou <strong>"Adicionar ao ecrã principal"</strong>.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowModal(false)}
              className="mt-5 w-full py-3 bg-csc-dark text-white rounded-xl font-black text-xs hover:bg-csc-dark/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check size={16} className="text-csc-gold" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
