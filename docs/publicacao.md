# Preparar e publicar o Leve

## Estado desta entrega

A revisão inclui uma lista diária mais enxuta, consulta de tarefas separada da edição e acompanhamento de hábitos por calendário e histórico visual. A comparação semanal foi preservada; uma demonstração sem cadastro ficou para uma próxima etapa.

A descontinuação do Google Agenda exige publicar primeiro o handler de encerramento e validar o bloqueio de clientes antigos; depois publicar o frontend. Este documento descreve o procedimento, sem confirmar alteração do ambiente hospedado. Ver [plano operacional](google-agenda.md).

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
2. Se houver mudanças de infraestrutura ainda não aplicadas, valide os SQLs em teste antes de aplicá-las ao projeto alvo. Os scripts `setup:supabase`, `setup:push` e `setup:google -- --apply` alteram o ambiente remoto: revise o destino e os efeitos antes de executá-los. Uma atualização apenas de interface não exige reaplicar esses scripts.
3. Configure na Vercel somente as variáveis públicas necessárias de `.env.example`. Não importe o `.env.local` inteiro.
4. Faça o deploy da revisão validada, confirme o Node configurado e teste os fluxos no domínio público. O build do frontend não aplica SQLs nem publica a função Supabase.
5. Confira cabeçalhos, erros CSP, login, recuperação, troca de conta, bloqueio Calendar, desconexão legada, push e reabertura offline. Verifique os logs sem copiar conteúdo de usuários para issues.

Mantenha a revisão anterior disponível para rollback do frontend. Mudanças no banco e em credenciais exigem procedimentos próprios; voltar o deploy Vercel não as desfaz.
