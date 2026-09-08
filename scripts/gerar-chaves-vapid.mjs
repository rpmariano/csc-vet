/*
 * Gera o par de chaves VAPID dos avisos push.
 *
 *   node scripts/gerar-chaves-vapid.mjs
 *
 * Faz o mesmo que `npx web-push generate-vapid-keys`, sem descarregar nada —
 * é só uma chave P-256, e o Node sabe fazê-las sozinho. Serve também quando o
 * PowerShell recusa correr o `npx.ps1` por causa da política de execução.
 *
 * **A chave privada não sai daqui.** Aparece no teu terminal, vai para os
 * segredos do Supabase, e mais nada: não a ponhas no repositório, num chat,
 * nem num ficheiro versionado. A pública é pública por desenho — vai no
 * bundle da app, como a chave anónima do Supabase.
 *
 * O que fazer com elas está em `docs/avisos-push.md`.
 */

import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

const jwkPublica = publicKey.export({ format: 'jwk' })
const jwkPrivada = privateKey.export({ format: 'jwk' })

/** base64url → Buffer. */
const deBase64Url = (s) => Buffer.from(s, 'base64url')

/*
 * A chave pública VAPID é o ponto da curva sem compressão: um `0x04` à cabeça,
 * depois X e Y com 32 bytes cada. O JWK dá X e Y em separado.
 */
const publica = Buffer.concat([
  Buffer.from([0x04]),
  deBase64Url(jwkPublica.x),
  deBase64Url(jwkPublica.y),
]).toString('base64url')

/* A privada é o escalar `d`, que o JWK já dá em base64url. */
const privada = jwkPrivada.d

if (publica.length !== 87 || privada.length !== 43) {
  console.error('Comprimento inesperado — não uses estas chaves.')
  process.exit(1)
}

console.log('')
console.log('  A chave privada abaixo é um segredo. Copia-a daqui direto para os')
console.log('  segredos do Supabase — não a partilhes num chat, num email, nem')
console.log('  numa captura de ecrã. Se isso acontecer, corre este script outra')
console.log('  vez e usa o par novo.')
console.log('')
console.log('VAPID_PUBLIC_KEY  (pública — vai no bundle da app)')
console.log(publica)
console.log('')
console.log('VAPID_PRIVATE_KEY (privada — só nos segredos do Supabase)')
console.log(privada)
console.log('')
console.log('Passos seguintes: docs/avisos-push.md')
