import React, { useEffect, useState } from 'react'
import { linkTemporario } from '../lib/documentos'

/**
 * O link para abrir um documento de um atleta.
 *
 * Os documentos estão num bucket privado, por isso o endereço não se guarda:
 * pede-se um link temporário ao abrir o ecrã (válido por uma hora) e só então
 * o link fica ativo. Pedi-lo só ao tocar não serve — o Safari do iPhone
 * bloqueia uma janela aberta depois de uma espera, e o toque abria nada.
 *
 * Enquanto o link não chega, ou se não houver permissão para o ler, desenha o
 * mesmo conteúdo sem ser link, e diz porquê a quem usa leitor de ecrã.
 */
export const LinkDocumento: React.FC<{
  valor: string
  className?: string
  children: React.ReactNode
}> = ({ valor, className = '', children }) => {
  /* O resultado guarda o valor a que respeita: mudar de documento é, até o
     link novo chegar, voltar a "a preparar" — derivado aqui, sem repor estado. */
  const [resultado, setResultado] = useState<{ valor: string; href: string | null } | null>(null)

  useEffect(() => {
    let cancelado = false
    linkTemporario(valor).then(link => {
      if (!cancelado) setResultado({ valor, href: link })
    })
    return () => { cancelado = true }
  }, [valor])

  const pronto = resultado?.valor === valor ? resultado : null
  const href = pronto?.href ?? null
  const falhou = pronto !== null && href === null

  if (!href) {
    return (
      <span className={`${className} opacity-60`} aria-disabled="true" title={falhou ? 'Sem acesso a este documento' : 'A preparar o link…'}>
        {children}
        <span className="sr-only">{falhou ? ' (sem acesso)' : ' (a preparar)'}</span>
      </span>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}

export default LinkDocumento
