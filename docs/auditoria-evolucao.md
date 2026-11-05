# Auditoria e evolução da confiabilidade

Execução local em 05/11/2026. Baseline local `c296100`; a árvore já continha as correções de exclusão e a retirada de material do LinkedIn. Branch `melhoria-confiabilidade-local`. Fixtures fictícias, sem leitura de `.env*`, backups ou dados pessoais. Testes/build usam `LEVE_ISOLATED_CHECKS=1`: o Vite não carrega os arquivos de ambiente do projeto. Nenhuma ação remota de aplicação, credencial ou deploy autorizada nesta etapa.

## P0 — primeira etapa

| Achado | Classificação / severidade | Evidência e reprodução | Correção / teste | Risco residual |
| --- | --- | --- | --- | --- |
| Logout apaga estado mesmo com falha no envio | Confirmado por código e regressão no baseline; integridade alta | `src/store/sync.ts`, `finishSignOut`, `push`; fixtures HTTP 401/403/503 e envio suspenso | Retorno de sucesso explícito, verificação de pendências/versão antes de limpar; espera limitada; opção de cancelar ou descartar conscientemente. `sync.integrity.test.ts` | Resposta de rede expirada não prova cancelamento no servidor; integração Auth/Realtime real exige validação separada |
| Entrada longa contamina estado persistido | Confirmado por testes que falharam no baseline; integridade alta | `QuickAdd.tsx`, `store.ts` e limite de `isTask`; captura de 1001 caracteres | Entrada preservada para correção, interpretação limitada e escrita central recusa registros inválidos. `integrity.test.ts` | Limite segue unidades UTF-16, compatível com validação atual; retorno de ações antigas ainda precisa de revisão completa de feedback |
| Um registro inválido oculta todos os demais | Confirmado por teste no baseline; integridade alta | `persistence.ts`, `load`; snapshot com uma tarefa válida e outra inválida | Recupera registros estruturais válidos; pausa gravação/sync; exportação com estado atual e snapshot original; não altera nem apaga automaticamente o original | JSON estruturalmente irrecuperável permanece exportável. Importação/mesclagem automática de recuperação não foi implementada |
| Eventos de chaves auxiliares revertem capturas | Confirmado por teste no baseline; integridade alta | Listener `storage` em `store.ts`; evento `leve.reminders.sent` | Eventos auxiliares ignorados; gravação sem debounce; divergência na chave de estado bloqueia sobrescrita e oferece exportação das duas versões | Não há transação atômica entre abas nem fusão automática. Testar abas reais, inclusive janelas concorrentes no mesmo instante |
| Quota gera sucesso silencioso de persistência | Confirmado por código e simulação local; integridade alta | `persistence.ts`, `save`; `Storage.setItem` lançando `QuotaExceededError` | Aviso persistente, exportação e tentativa explícita de salvar novamente | Fechar sem exportar ainda perde alterações somente em memória; validar bloqueio de armazenamento no iOS |
| Troca de conta com dados pendentes | Confirmado por código e teste local; privacidade/integridade alta | `sync.ts`, `start`; sessão B após captura da conta A | Interrompe transição e preserva snapshot/journal de A; não envia dados de A como B | Retorno à conta original após conflito exige revisão manual da recuperação; não foi validado com OAuth real |

### Verificações P0

- As três primeiras reproduções de persistência falharam no código inicial e passaram após a correção.
- Os cenários de logout também foram executados contra o `sync.ts` do baseline em execução isolada, restaurando o arquivo corrigido em seguida: seis falhas, incluindo timeout.
- Suíte após P0: 144 testes aprovados em 17 arquivos. Nenhum teste usa a instância publicada.
- UI: intervenção mínima para impedir perda silenciosa — erro na captura mantendo o texto e aviso persistente apenas em caso de falha. Hipótese: explicitar o estado evita que a pessoa feche a aba acreditando que salvou. Validação humana: colar texto longo, simular quota, tentar exportar e recuperar as versões sem orientação do desenvolvedor.

## P1 — integrações e planejamento

| Achado | Classificação / severidade | Evidência e reprodução | Correção / teste | Risco residual |
| --- | --- | --- | --- | --- |
| Fila Google esvaziada antes de confirmar envio | Confirmado por código/teste no baseline; integridade alta | `googleCalendar.ts`, `processQueue`; cinco regressões novas falharam no arquivo do baseline | Remove após confirmação, execução serial por sessão, backoff de 5–60s, timeout HTTP e fila local de exclusões sem tokens. Id tentativo registrado antes do POST: exclusão durante criação fica na outbox. Testes de 503, retry, reload, desfazer e criação em voo | Resposta perdida seguida de DELETE 404 antes de um POST tardio concluir exige reconciliação posterior; não há serviço Google em background |
| Mesmo event id aplicado a outro calendário | Confirmado por teste no baseline; funcional alta | `googleCalendar.ts`, `preferences` e `syncTaskToGoogle`; tarefa legada + novo destino | Campo opcional `googleCalendarId`; fixa destino legado antes da mudança; novos itens usam a nova seleção. Nenhum evento movido/excluído em massa | Reconectar outra conta Google e usar clientes antigos em paralelo precisa de revisão manual. Não se presume a identidade de eventos legados já órfãos |
| POST repetido pode duplicar evento | Confirmado por código e teste no baseline; funcional alta | `syncTaskToGoogle`; falha de rede após envio | Id estável SHA-256 em alfabeto permitido, propriedade privada da tarefa e reconciliação de 409 antes de PATCH; mantém ids já existentes | Id de evento cancelado/colisão não reconciliável permanece em erro, sem criar outra cópia silenciosa; validar 409 real com conta de teste |
| Notificação fria consome URL antes dos dados | Confirmado por código e teste de jornada com fixtures; funcional alta | `reminders.ts`, `notificationNavigation.ts` e efeito em `App.tsx`; sessão/dados ainda indisponíveis | Preserva intenção e query até sessão e leitura confirmadas; valida id/data; owner no worker/SW; conta incorreta não abre nem consome intenção | Push antigo sem owner só pode conferir a existência no estado da conta atual; apps offline aguardam sincronização para abrir automaticamente. Entrega real não testada |
| Título pessoal em tela bloqueada | Melhoria de privacidade, funcional média | `domain/reminders.ts`, Perfil, worker | Opção Lembretes discretos, texto genérico, teste local sem título no payload | Só se aplica ao push fechado após publicar o worker; notificações antigas não são removidas pelo app |
| Orçamento semanal mínimo mesmo sem espaço | Confirmado por três testes que falharam no baseline; funcional alta | `planner.ts`, `dayBudget` e `planWeek` | Une intervalos, recorta à janela, desconta almoço e mantém orçamento zero. Não atribui dia quando nenhuma opção comporta a tarefa | Durações são estimativas; tarefas sem encaixe continuam sem data. Calendários externos não são importados |
| Chip de duração/período descartado continuava aplicado | Confirmado por código/teste; funcional média | `store.ts`, `buildCapture` | Descarta período junto de horário e volta à duração padrão ao rejeitar chip, sem perder campos aceitos | O título original é preservado quando há rejeição, conforme comportamento anterior; spans do parser para reconstrução seletiva do texto ficam como proposta |
| Journal era persistido só ao enviar/ocultar a página | Confirmado por código/teste; integridade alta | `sync.ts`, subscribe e `writeJournal` | Journal síncrono com a mutação, aviso próprio em falha, retry e preservação de dono se a limpeza local falhar | Estado e journal continuam em duas chaves, sem transação multiaba; migração para IndexedDB requer projeto separado |

Referência para idempotência Google: [Events: insert, regras de id e propriedades privadas](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert). Essa consulta foi documental, sem chamadas à integração publicada.

## Revisão defensiva e limites

- Inspeção estática: `supabase/schema.sql:17` (RLS), `:22`/`:23` (dono na leitura/escrita), `:33` (grants); `supabase/google-calendar.sql:19`–`:23` (sem CRUD cliente). Nenhum SQL alterado/aplicado. O runner SQL descartável falhou antes de iniciar: daemon Docker local indisponível. Não inferir estado da produção desses arquivos.
- OAuth/refresh: mantidos escopos, PKCE, prova, estado consumido, JWT e origem no handler; AES-GCM e segredo permanecem no servidor. Os testes locais do handler continuam na suíte. Nenhuma credencial foi lida ou alterada.
- Push: mantidos segredo cron, POST, limite de execução, allowlist HTTPS, redirects bloqueados, timeout e deduplicação por aparelho. Escala multi-instância e uma interrupção entre envio e confirmação de `push_sent` continuam riscos operacionais.
- Não encontrados `dangerouslySetInnerHTML`, `eval` ou `new Function` no código de produto inspecionado. CSP/HSTS e cache público do SW foram revisados estaticamente; cabeçalhos reais e comportamento Safari não foram consultados.
- A política foi ajustada para explicar a opção discreta e sua dependência da versão do worker. O contato público foi preservado: recomenda-se um alias/canal dedicado administrado pelo responsável, sem inventar um endereço.
- O limite e a gravação síncrona favorecem durabilidade. Desempenho com acervos próximos da quota de 10 mil registros ainda exige medição; não há alegação de fluidez mensurada.

## Verificação visual local

Edge headless em perfil temporário, Supabase explicitamente desativado, fixtures fictícias. Larguras 320/360/390/1280: sem overflow horizontal no modal e rodapé dentro de 844px; lixeira acessível no cabeçalho. Quinze Tabs por tamanho permaneceram no modal. Captura de 1001 caracteres: texto mantido, botão desabilitado, alerta visível e sem overflow. Quota simulada: aviso persistente visível em 320px. Preferência de movimento reduzido reconhecida no navegador.

Não equivale a teste em Android/iOS, leitor de tela, teclado virtual, zoom real de 200%, contraste de todas as combinações ou pesquisa com pessoas. Duas abas reais com logins distintos e corrida simultânea de `localStorage` não foram testadas; a regressão automatizada simula eventos e alteração de snapshots.

## Aceite global

1. Falha de sync sem apagar silenciosamente: coberta localmente para os cenários testados, incluindo primeira leitura não confirmada e alterações durante logout.
2. Registro inválido não oculta todo o acervo sem recuperação: registros válidos continuam disponíveis; original preservado e exportável na conta original. Cópias legadas sem proveniência não são importadas/mescladas automaticamente.
3. Abas: conflito detectado e gravação pausada; não se declara solução transacional completa de concorrência.
4. Google: retry/idempotência/destino/outbox e criação→exclusão em voo cobertos nos cenários simulados. **Parcial** para resposta de criação indeterminada com confirmação tardia no servidor e para reconexão de outra conta Google.
5. Notificação fria: coberta com mocks e owner novo; depende da publicação futura do worker e validação em dispositivo.
6. Captura e início simples preservados; testes existentes de foco/retomada continuam necessários na suíte final.
7. Zero disponibilidade corrigida; avisos de estimativa e ausência de importação externa preservados.
8. Conferir o resultado final no checklist; build isolado sem credenciais não equivale a build/deploy de produção.

## Resultado consolidado

- `npm ci`: 152 pacotes instalados, auditoria de 153 pacotes concluída.
- `LEVE_ISOLATED_CHECKS=1 npm test`: **166 testes aprovados em 18 arquivos**; baseline desta sessão tinha 130 testes.
- Build TypeScript/Vite isolado aprovado. Avisos de import estático/dinâmico e chunk Supabase vazio no modo sem backend, sem erro de compilação.
- `npm audit`: **0 vulnerabilidades conhecidas** na consulta desta execução; não equivale à ausência de falhas no produto.
- `npm run setup:push -- --bundle`: worker regenerado, sem ler configuração local nem publicar.
- `git diff --check`: sem erros nas alterações de código; a documentação final também deve ser conferida antes do commit.
- SQL descartável: tentativa executada, **não validado** por Docker Desktop indisponível. Não houve conexão com banco remoto.
- `npm run check:secrets -- --dist --history`: nenhum segredo reconhecido pelos padrões verificados. Após o último ajuste de cancelamento, a verificação dos arquivos/bundle foi repetida, também sem achados. Não foram lidos `.env*`, backups ou conteúdo das cópias locais do LinkedIn.

Pontos de entrada no código final: `src/store/persistence.ts:29` (recuperação), `:52` (durabilidade/conflito), `src/store/sync.ts:476` (contas), `:545` (cancelamento), `:558` (barreira de logout), `src/services/googleCalendar.ts:374` (vínculo/idempotência), `:586` (fila), `src/domain/planner.ts:281` e `:295` (capacidade/semana). Os testes nomeados acima são a evidência executável; números de linha podem mudar em revisões posteriores.

Commits locais desta rodada: `b1778f5` (P0), `82ad798` (planejamento), `c565b20` (reconciliação, notificações e complementos de integridade). Cancelamento de requisições e documentação em commits separados. Não houve push ou criação de PR, para não disparar publicações no ambiente hospedado.

Complemento final P0: o timeout/troca de sessão também aborta as requisições PostgREST. O teste de espera esgotada confirma `AbortSignal.aborted` e preservação da captura. Abortar o cliente não desfaz uma transação que o servidor já tenha aceitado; não há alegação de rollback distribuído.
