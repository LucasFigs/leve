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

## Etapas seguintes

P1 Google, navegação por notificações, planejamento e inspeção defensiva estão em investigação. Não considerar os oito critérios globais de aceite concluídos a partir dos testes P0.
