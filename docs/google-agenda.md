# Encerramento do Google Agenda no MVP

A integração sai do MVP por custo e complexidade de OAuth, manutenção e suporte diante do benefício limitado: enviava eventos, sem importar disponibilidade externa. Isso não decorre de vulnerabilidade confirmada. A Agenda do Leve, tarefas, projetos, planejamento, lembretes, login Google (`openid email profile`) e sincronização Supabase permanecem.

Este documento descreve o código e o procedimento a autorizar. Merge, build e testes locais **não comprovam publicação nem revogação real**. Não executar scripts administrativos nesta etapa.

## Comportamento nesta versão

- Novas conexões, conclusão OAuth, emissão/renovação de access tokens e preferências Calendar são rejeitadas pelo handler com 410 após origem e autenticação; o callback público responde 410 sem transportar código ou trocar token.
- O cliente não observa mudanças do store, não lista calendários, não processa filas e não executa POST/PATCH/DELETE de eventos. Entradas legadas de sincronização retornam sem rede. A consulta de vínculo só usa `status`, sem renovação.
- Conta sem vínculo não vê Calendar como recurso ativo. Conta com vínculo ou identificadores antigos encontra o gerenciamento em Configurações. Dados e privacidade oferece também o acesso às permissões da Conta Google, inclusive quando não é possível consultar o servidor.
- Desconectar tenta revogar o refresh token da conta autenticada antes de remover seu vínculo e estados OAuth pendentes. Só declara revogação confirmada com resposta positiva do Google. Se a tentativa falhar, a remoção do vínculo e a revogação não confirmada são informadas separadamente, com instrução manual. Sem credencial armazenada, não se afirma revogação externa.
- Nenhum evento externo é removido. Eventos já enviados devem ser administrados no Google; não acompanharão futuras alterações no Leve após a ativação do encerramento.

## Compatibilidade dos dados

`googleEventId`, `googleCalendarId` e `googleDeletions` continuam válidos. Não há migração ou remoção retroativa. Conversores puros são preservados, mas não enviam eventos. Backups e recuperação mantêm os campos antigos.

A outbox Calendar deixa de contar em `hasPending()`; alterações reais Supabase continuam protegidas. Antes de logout/troca de conta, a fila é preservada em `leve.gcal.retired-outbox.v1.<owner codificado>`, sem tokens. Ao entrar, somente a conta correspondente recupera essa fila no estado, tornando-a novamente exportável. Ela permanece inerte e não é apagada automaticamente. Falha ao preservar armazenamento interrompe a saída para evitar perda. O arquivo não é sincronizado com outros aparelhos; limpar dados do navegador pode apagá-lo. Acesso ao mesmo perfil do navegador continua sujeito aos limites de proteção local descritos na política.

## Plano operacional — autorização separada

1. Registrar revisão atual de frontend/handler, inventário de clientes legados e backup seguro das tabelas/configurações, sem copiar credenciais para logs. Usar homologação com contas fictícias primeiro.
2. Publicar **primeiro** `supabase/functions/google-calendar/handler.ts`, suas dependências `crypto.ts` e o entrypoint `index.ts`, mantendo autenticação, origem e configuração originais. Sem reaplicar SQL ou gerar novas chaves. Não remover provedor Google, client ID/secret ou redirects de identidade no Supabase/Google.
3. Com sessão fictícia válida e origem autorizada, verificar 410 para `begin`, `complete`, `token`, `preferences` e ações desconhecidas; callback deve responder 410 sem Location/código. Conferir 403 para origem indevida e 401 para sessão ausente/inválida nas operações privadas.
4. Confirmar `status` mínimo sem segredos e sem chamada ao endpoint de token. Testar desconexão com vínculo fictício, revogação positiva e falha simulada; confirmar isolamento por conta e mensagens precisas.
5. Verificar ausência de chamadas a `/calendar/v3/.../events` ao criar/editar/concluir/reagendar/excluir tarefas e ao restaurar estado/fila, tanto no novo cliente quanto em um cliente legado que solicita novo token. Preservar os eventos fictícios externos durante os testes.
6. **Limite importante:** um PWA antigo já possui código de envio direto ao Google e pode possuir access token ainda válido em memória. O handler novo impede novos tokens, mas não cancela os já emitidos ou operações já em voo. Aguardar a validade máxima dos tokens previamente emitidos (normalmente até uma hora, confirmar configuração), acrescida da janela de requests em andamento, ou obter revogação explícita autorizada. Durante essa janela não declarar encerramento efetivo nem ausência garantida de gravações externas. Fechar o app novo não interrompe uma aba antiga já aberta.
7. Depois da proteção backend e da janela anterior, publicar frontend e políticas/textos da mesma revisão. Orientar atualização/reabertura do PWA e testar os dois clientes. Não depender exclusivamente de limpeza do cache: o service worker e abas antigas exigem verificação própria.
8. Homologar login Google, recuperação de sessão, duas contas, logout com fila legada e com escrita Supabase real pendente, criação/edição de ocorrência, Agenda interna, disponibilidade, notificações, offline e reabertura em Android/iOS. Testes emulados não substituem aparelhos reais.
9. Registrar revisão exata publicada e evidências sem dados pessoais. Monitorar chamadas rejeitadas e falhas de desconexão, sem registrar tokens, códigos OAuth ou conteúdo de tarefas.

As respostas de status/desconexão desta revisão incluem `retired: true`, sem segredos. Isso permite distinguir a versão de encerramento de um backend antigo. O cliente só declara revogação confirmada com `disconnected: true`, `revoked: true` e esse marcador; respostas antigas/ambíguas mantêm orientação manual.

O bloqueio cobre os endpoints do Leve, não permissões globais na Conta Google. Se existirem versões históricas que autorizavam Calendar diretamente no navegador ou outros clientes OAuth, inventariá-los em homologação e definir sua retirada com autorização separada, preservando o provedor e os escopos de identidade. Não declarar bloqueio universal apenas com o deploy deste handler.

## Rollback e limpeza posterior

Manter o handler de encerramento em qualquer rollback de frontend. **Não restaurar o handler anterior**, que reativaria autorização e emissão de tokens. Se o gerenciamento falhar, corrigir apenas status/desconexão e manter o caminho manual da Conta Google. Não limpar armazenamento, trocar a chave de cifragem ou reaplicar setup para tentar resolver.

Somente uma etapa posterior, autorizada e com política de retenção, pode remover tabelas, estados pendentes, credenciais Calendar e arquivos locais. Critérios: backend de encerramento confirmado, janela de tokens antigos encerrada, versões legadas avaliadas, usuários informados, caminho de revogação/resolução de falhas definido, backups/recuperação verificados e dependências de autenticação separadas. Não remover credenciais compartilhadas com o login. Não fazer exclusão em massa nem revogação forçada como efeito deste PR.
