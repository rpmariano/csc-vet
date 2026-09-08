/*
 * Gera o par de chaves VAPID dos avisos push.
 *
 *   node scripts/gerar-chaves-vapid.mjs
 *
 * Faz o mesmo que `npx web-push generate-vapid-keys`, sem descarregar nada —
 * é só uma chave P-256, e o Node sabe fazê-las sozinho. Serve também quando o
 * PowerShell recusa correr o `npx.ps1` por causa da política de execução.
 *
 * **Escreve as chaves num ficheiro**, e não só no ecrã. A pública tem 87
 * caracteres e quebra em duas linhas em qualquer terminal: à primeira vez,
 * foi copiada a meio e o Supabase respondeu «Vapid public key should be 65
 * bytes long when decoded». De um ficheiro copia-se inteira.
 *
 * **A chave privada não sai daqui.** Vai para os segredos do Supabase, e mais
 * nada: não a ponhas no repositório, num chat, nem numa captura de ecrã. O
 * ficheiro que isto escreve está no `.gitignore`.
 *
 * O que fazer com elas está em `docs/avisos-push.md`.
 */

import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

/* A mesma validação que o servidor de push faz, antes de as dar como boas. */
if (deBase64Url(publica).length !== 65 || deBase64Url(privada).length !== 32) {
  console.error('Comprimento inesperado — não uses estas chaves.')
  process.exit(1)
}

const ficheiro = resolve(process.cwd(), 'chaves-vapid.local.txt')
writeFileSync(
  ficheiro,
  [
    '# Chaves VAPID dos avisos push — geradas por scripts/gerar-chaves-vapid.mjs',
    '# A privada é um segredo. Apaga este ficheiro depois de as guardares.',
    '',
    `VAPID_PUBLIC_KEY=${publica}`,
    `VAPID_PRIVATE_KEY=${privada}`,
    '',
  ].join('\n'),
  'utf8',
)

console.log('')
console.log('  Escrevi as duas chaves em:')
console.log('  ' + ficheiro)
console.log('')
console.log('  Copia-as DE LÁ, e não do ecrã: a pública tem 87 caracteres e')
console.log('  quebra em duas linhas aqui, o que leva a copiá-la a meio.')
console.log('')
console.log('  A privada é um segredo — vai para os segredos do Supabase e mais')
console.log('  lado nenhum. Apaga o ficheiro depois de as guardares.')
console.log('')
console.log(`  VAPID_PUBLIC_KEY   ${publica.length} caracteres`)
console.log(`  VAPID_PRIVATE_KEY  ${privada.length} caracteres`)
console.log('')
console.log('  Passos seguintes: docs/avisos-push.md')
