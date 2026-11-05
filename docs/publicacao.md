# Preparar e publicar o Leve

## Estado desta entrega

As correções foram verificadas localmente com testes TypeScript e SQL. **A atualização da infraestrutura e da instância pública ainda está pendente.** O backup remoto/local precisa ser resolvido antes das alterações no ambiente existente. Não apresente a instância atual como validada por estas correções.

## Repositório

```bash
npm ci
npm test
npm run build
npm audit
npm run check:secrets -- --dist --history
npm run setup:push -- --bundle
git status --short
git diff --check
```

No Windows com Docker, rode também `npm run test:database`. A CI testa o banco num PostgreSQL isolado no Linux. Esses testes não cobrem o transporte Auth/Realtime nem a entrega real de notificações.

Antes do commit, revise o diff e a lista de arquivos. `.env.local`, backups, o contexto privado do LinkedIn e o relatório operacional não devem aparecer. Use um commit com escopo claro e revise o resultado da CI após enviar a branch. O workflow não publica automaticamente.

## Infraestrutura e Vercel

1. Verifique e preserve um backup dos dados/configurações antes de aplicar mudanças. Uma cópia parcial não substitui um plano de recuperação completo.
2. Valide os SQLs em teste; depois aplique `supabase/schema.sql` e `supabase/push.sql` ao projeto alvo. Os scripts `setup:supabase` e `setup:push` também alteram Auth, função e cron: revise o destino e os efeitos antes de executá-los.
3. Configure na Vercel somente as variáveis públicas necessárias de `.env.example`. Não importe o `.env.local` inteiro.
4. Faça o deploy da revisão validada, confirme o Node configurado e teste os fluxos no domínio público. O build do frontend não aplica SQLs nem publica a função Supabase.
5. Confira cabeçalhos, erros CSP, login, recuperação, troca de conta, Google Agenda, push e reabertura offline. Verifique os logs sem copiar conteúdo de usuários para issues.

Mantenha a revisão anterior disponível para rollback do frontend. Mudanças no banco e em credenciais exigem procedimentos próprios; voltar o deploy Vercel não as desfaz.

## LinkedIn

O rascunho em [publicacao-linkedin.md](publicacao-linkedin.md) prioriza o produto, a arquitetura e o aprendizado. Publique a demonstração online depois de concluir a validação acima. Não use expressões como “invulnerável”, “100% seguro” ou “segurança certificada”.

Para acompanhar o texto, prefira duas ou três capturas de Hoje, Agenda e Projetos com tarefas fictícias. Mostre o fluxo do produto e o resultado do planejamento. Confira nomes, e-mails, notificações, abas abertas e conteúdo de tarefas antes de publicar as imagens.
