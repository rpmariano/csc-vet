/**
 * O que dizer a quem usa a app quando uma escrita ou leitura falha.
 *
 * Os toasts colavam o `error.message` do Supabase à frente da frase: "Erro ao
 * guardar torneio: new row violates row-level security policy for table…".
 * Inglês técnico, que não diz a um treinador o que fazer, com cinco
 * variações de remendo quando a mensagem vinha vazia ("Erro", "Erro
 * desconhecido", "erro inesperado", "Verifique a base de dados"…).
 *
 * Os erros da base e da rede traduzem-se aqui pelos códigos que o Postgres e
 * o PostgREST dão; o original vai para a consola, que é onde serve. Um erro
 * lançado pela própria app (`throw new Error('Escolhe um torneio')`) já está
 * em português e passa como está.
 */
export const mensagemDeErro = (err: unknown): string => {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown }
  const codigo = typeof e.code === 'string' ? e.code : ''
  const mensagem = typeof e.message === 'string' ? e.message : ''
  const daBase = codigo !== '' || e.status !== undefined || e.statusCode !== undefined

  if (codigo === '42501' || /row-level security|permission denied/i.test(mensagem)) {
    console.error(err)
    return 'não tens permissão para fazer isto'
  }
  if (codigo === '23505') return 'já existe um registo igual'
  if (codigo === '23503') return 'há outros dados que dependem deste'
  if (codigo === '23502') return 'falta preencher um campo obrigatório'
  if (codigo === 'PGRST116') return 'o registo já não existe'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensagem)) {
    return 'sem ligação à internet'
  }
  if (daBase || !mensagem || err instanceof TypeError) {
    console.error(err)
    return 'tenta outra vez — se voltar a falhar, avisa a direção'
  }
  return mensagem
}
