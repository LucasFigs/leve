# Checklist de revisão e publicação — confiabilidade

Nenhum deploy, migração, configuração OAuth, alteração de credencial ou teste de produção foi executado nesta rodada. A branch de trabalho é local; não enviar material do LinkedIn.

## Verificação local sem credenciais

PowerShell, Node compatível:

```powershell
$env:LEVE_ISOLATED_CHECKS='1'
npm ci
npm test
npm run build
npm audit
npm run check:secrets -- --dist --history
npm run setup:push -- --bundle
git diff --check
```

O modo isolado faz Vite/Vitest ignorarem `.env*` do projeto. O build resultante funciona sem Supabase e **não deve substituir inadvertidamente o build configurado de produção**. O bundler de push encerra antes da leitura de configuração quando recebe `--bundle`. Não executar outros modos de setup durante esta auditoria.

O teste SQL usa container local descartável, sem porta/volume/rede e sem credenciais reais. Rodar `npm run test:database` apenas com Docker local disponível. Nesta execução, falhou porque o daemon do Docker Desktop não estava iniciado; não é um resultado de validação do banco.

## Compatibilidade e rollout para revisão manual

- Sem mudança SQL nesta rodada. `googleCalendarId` e `discreetReminders` são opcionais em registros existentes; `googleDeletions` é uma outbox **local** no estado v1 da conta, sem tokens. Snapshots antigos continuam legíveis. Não atribuir retroativamente origem a eventos sem verificar o destino.
- `supabase/functions/send-reminders/index.ts` foi regenerado apenas localmente. A função publicada continua na revisão anterior até implantação autorizada. Owner no push e opção discreta com app fechado dependem dessa implantação.
- Manter uma exportação revisada dos dados antes de qualquer rollout. O arquivo de recuperação contém conteúdo das tarefas e não deve ser publicado ou enviado em issues.
- Calendar: publicar o handler de encerramento antes do frontend e considerar tokens antigos ainda válidos. Não reativar o handler anterior em rollback. Ver [ordem e limites de ativação](google-agenda.md).
- Se precisar de rollback de frontend, manter os campos novos intactos e exportar a outbox. Não limpar armazenamento nem copiar dados entre contas para “resolver” conflitos. Voltar o frontend não desfaz operações que já chegaram ao Google.
- Recuperação inválida/conflito exige revisão das versões exportadas, validação dos registros e confirmação de dono. Não foi entregue importação automática; preservar o snapshot original até revisão. Cópia legada sem conta de origem não deve ser anexada à conta que entrar depois.

## Cenários manuais antes de publicar

- Login A → editar offline → 401/403/503/timeout → tentar sair: cancelar preserva os dados; retry confirma envio; descarte exige decisão consciente. Não testar falhas provocadas contra produção.
- Criar e recarregar antes de 600ms; duas abas com edições distintas; chave de lembretes; storage bloqueado/quota; exportar e verificar recuperação; mudança de conta não mostra/exporta dados anteriores.
- Calendar com mocks: 410 para begin/complete/token/preferences e callback antigo; status mínimo autenticado; revogação positiva/falha, sem chamadas de eventos. Confirmar que login Google e pendências reais Supabase continuam funcionando.
- Clientes antigos podem manter requests e tokens anteriores. Confirmar a janela de emissão/validade antes de declarar encerramento efetivo; não testar operações destrutivas contra produção.
- Push: abrir com app encerrado → login → dados → ocorrência correta; repetir em conta errada e depois voltar à original. Nova opção discreta não muda avisos já entregues e não garante entrega.
- Celulares Android/iOS: teclado virtual, offline/reabertura, zoom 200%, contraste, leitor de tela, foco/Tab/Escape, alvos de toque e movimento reduzido. Edge headless não substitui esses testes.
- Capturar → começar sem passos/Pomodoro → pausar → recarregar → retomar → concluir → desfazer → replanejar. Verificar tempo acumulado e alcance de recorrências.
- Plano sem janela, só almoço, eventos sobrepostos, tarefa longa, final de expediente, mudança de dia e fuso/DST. Confirmar linguagem de estimativa baseada nos itens do Leve.

## Resultado desta rodada

O relatório final e os resultados locais estão em [auditoria-evolucao.md](auditoria-evolucao.md). Aprovação do build e da suíte não encerra os itens manuais acima nem comprova configuração do ambiente publicado.
