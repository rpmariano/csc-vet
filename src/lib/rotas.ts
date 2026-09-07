/**
 * Endereços que a app tem de saber montar por inteiro, com o `base` do Vite.
 *
 * A app é servida em `/csc-vet/` (ver `vite.config.ts`), e o `BrowserRouter`
 * tem esse prefixo por `basename` — dentro da app escreve-se `/settings` e o
 * router trata do resto. Mas há sítios que saem da app e têm de voltar: o link
 * de recuperação de palavra-passe vai por email e o Supabase precisa do
 * endereço completo, prefixo incluído. Escrito à mão, dava um link para
 * `/nova-palavra-passe` que em produção não existe.
 */

/** Prefixo com que a app é servida, sempre com barra no fim. */
export const BASE = import.meta.env.BASE_URL || '/'

/** Caminho absoluto (sem domínio) do ecrã de nova palavra-passe. */
export const caminhoNovaPalavraPasse = (): string => `${BASE}nova-palavra-passe`
