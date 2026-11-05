# Contribuindo

Use Node.js 22.12+ e instale as dependências com `npm ci`. O app funciona localmente sem configurar serviços externos; siga o README para integrações opcionais.

1. Crie uma branch para uma alteração com escopo definido.
2. Preserve a separação entre regras em `src/domain`, integrações em `src/services` e estado em `src/store`.
3. Para mudanças de comportamento, inclua testes que demonstrem o problema e a correção.
4. Execute `npm test`, `npm run build` e `npm run check:secrets -- --dist` antes do pull request.
5. Para mudanças no banco, execute os testes SQL em ambiente isolado. Para mudanças no worker, regenere o pacote com `npm run setup:push -- --bundle` e inclua o resultado.

Descreva o problema, o comportamento final e a validação realizada no pull request. Use dados fictícios em screenshots e exemplos. Nunca inclua `.env.local`, backups, chaves privadas ou dados de usuários.

Os comandos `setup:supabase` e `setup:push` alteram o projeto remoto configurado no ambiente. Eles não devem ser executados como parte de testes comuns nem em pull requests.

Relatos de vulnerabilidades seguem [SECURITY.md](SECURITY.md).
