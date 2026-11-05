# Google Agenda persistente

O vínculo pertence à conta do Leve. Após a primeira autorização offline, ele é restaurado ao autenticar e reabrir o app. O calendário escolhido e a preferência de sincronização automática também ficam no servidor. A integração continua enviando alterações do Leve ao Google; não importa compromissos externos para o planejador.

## Estado da ativação — 05/11/2026

Backend publicado no Supabase e URI de retorno confirmada pelo responsável no Google Cloud. Permissões verificadas no ambiente remoto: RLS habilitada nas duas tabelas, sem acesso CRUD de `anon`/`authenticated` e com acesso de `service_role`. Os testes HTTP reais confirmaram rejeição de origem externa (403), ausência de sessão (401), sessão inválida (401) e retorno seguro para callback inválido (303).

O frontend atualizado ainda precisa ser publicado na Vercel. A primeira autorização Google pelo novo fluxo e o teste de fechar/reabrir o PWA no celular continuam pendentes; os testes acima não validam o consentimento Google real.

## Proteções

- Authorization Code com acesso offline, PKCE S256, estado de uso único e expiração de dez minutos, com prova adicional do navegador iniciador.
- O callback público apenas devolve o código no fragmento da URL ao app. A troca exige JWT validado no Auth do Supabase, origem exata, usuário, estado e prova correspondentes. Um `user_id` enviado pelo cliente não define a identidade.
- A prova é guardada temporariamente no navegador para sobreviver ao redirecionamento; não é um token Google. Código e prova são removidos na conclusão; provas expiradas são descartadas ao restaurar.
- Refresh token cifrado com AES-256-GCM, IV aleatório e usuário como dado autenticado. A chave fica no ambiente da Edge Function, separada do banco. Não é criptografia ponta a ponta: administradores com acesso ao servidor e à chave podem decifrar.
- Tabelas com RLS e sem privilégios para `anon`/`authenticated`, mesmo para o próprio dono. Somente `service_role` acessa pela função; sem Realtime.
- Access token somente em memória do cliente. Respostas `no-store`; refresh token e segredos não são enviados ao navegador nem registrados pela aplicação.
- Logout cancela operações e limpa memória, preservando o vínculo. Desconectar remove o vínculo e solicita revogação; uma falha externa é informada. Excluir a conta elimina as credenciais por chave estrangeira.

## Configuração

1. Habilitar Calendar API no Google Cloud. No cliente OAuth Web do Leve, manter os redirects do login e adicionar `https://SEU-PROJETO.supabase.co/functions/v1/google-calendar/callback`, sem barra final.
2. Conferir `.env.local`: `VITE_SUPABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `APP_URL` (origem HTTPS exata), `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. O ID público, se preenchido, deve corresponder ao ID do servidor.
3. Executar `npm run setup:google` para conferir e empacotar sem alterações remotas.
4. Executar `npm run setup:google -- --apply` para criar as tabelas, gerar/preservar `GOOGLE_TOKEN_ENCRYPTION_KEY`, instalar os segredos e publicar a função. Guardar a chave em armazenamento seguro. Em instalação existente, usar a chave original e `--existing-key-confirmed`. Nunca gerar nova chave para vínculos existentes sem migração.
5. Publicar o frontend na Vercel. Nenhum segredo novo vai para variáveis `VITE_*` ou para a Vercel.
6. Conectar uma vez pelo Perfil para obter autorização offline. A autorização anterior, somente em memória, não pode ser convertida em refresh token.

A função usa `verify_jwt: false` no gateway para receber o callback público. Todos os POSTs verificam JWT em `/auth/v1/user` e origem dentro do handler. Não remover essas verificações internas.

## Limites e validação

A primeira autorização pode passar pelo navegador do sistema. Após concluir, reabrir o PWA na mesma conta Leve restaura o vínculo salvo. Se o retorno não compartilhar o armazenamento da origem iniciadora, a conexão falha de forma segura: iniciar e concluir no mesmo contexto. Validar Android e iOS reais.

Revogação, expiração e políticas da organização podem exigir nova autorização. Em aplicativos externos com consentimento em status **Teste**, o Google expira refresh tokens de Calendar após sete dias; publicar/verificar o OAuth é distinto do deploy na Vercel.

A renovação não envia alterações com o PWA encerrado: não há worker Google nesta mudança. A sincronização automática funciona com o app aberto; o botão Sincronizar permite atualização manual. Não há importação bidirecional. Consultar estado/erro e último envio, além do indicador de conexão.

Testes simulados cobrem servidor/cliente, renovação, isolamento, PKCE, expiração, replay, prova, criptografia e revogação. O runner SQL testa o esquema real num PostgreSQL descartável, incluindo bloqueio de acesso cliente e exclusão em cascata. Ainda é necessário validar consentimento real, Edge Function publicada e reabertura do PWA.

Referências: [OAuth para servidores](https://developers.google.com/identity/protocols/oauth2/web-server), [expiração de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration), [configuração do cliente](https://developers.google.com/workspace/calendar/api/quickstart/js).
