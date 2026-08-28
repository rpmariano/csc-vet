# Regras de Deploy

* Quando o utilizador pedir para "fazer deploy", "publicar", ou similar:
  1. Adiciona e commita todas as alterações pendentes no git (`git add .` seguido de `git commit -m "..."`).
  2. Faz `git push origin main` imediatamente de seguida.
  3. Não peças autorização para realizar nenhum destes passos. Executa-os automaticamente.
