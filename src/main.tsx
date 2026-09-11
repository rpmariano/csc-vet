import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { vigiarVersaoDaApp } from './lib/atualizacaoDaApp'

// Antes do primeiro render: um pedaço de código de uma versão antiga pode
// falhar logo na primeira rota, e o ouvinte tem de já lá estar.
vigiarVersaoDaApp()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
