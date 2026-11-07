# Controles e limites de segurança

Este documento descreve o código do repositório. A aplicação desses controles em um ambiente hospedado depende das migrações, das configurações e do deploy correspondente.

## Controles no código

- Políticas RLS vinculam os registros ao usuário autenticado, incluindo validação do proprietário na escrita.
- Calendar descontinuado: o handler aceita somente status autenticado e desconexão, sem entregar access tokens. Credenciais antigas permanecem cifradas até desconexão explícita; não há exclusão retroativa de eventos. Ver [ativação e riscos de clientes antigos](google-agenda.md).
- Envios push validam provedores e HTTPS, bloqueiam redirects e usam timeout. O banco limita inscrições e registros por conta.
- Dados recebidos pela sincronização e pelo worker passam por validação estrutural.
- A configuração Vercel inclui CSP e outros cabeçalhos; o service worker limita o cache aos arquivos do app.
- Testes de regressão e verificações de dependências e padrões de segredos apoiam a manutenção.

Esses controles não são garantia contra ataques. Tarefas e sessão Supabase continuam armazenadas no navegador para permitir uso local/offline. Acesso ao perfil do dispositivo ou execução de JavaScript malicioso na origem pode comprometer os dados. O bloqueio de clientes Calendar antigos depende da publicação do handler de encerramento; tokens emitidos antes disso podem continuar utilizáveis até expirar. O frontend novo não executa operações de eventos. Veja [plano de transição](google-agenda.md).

## Configuração e credenciais

As variáveis `VITE_*` são públicas e podem aparecer no bundle. Use esse prefixo somente para URL, chave anon/publishable do Supabase, client ID Google e chave pública VAPID. Chaves públicas não substituem autorização no banco.

Tokens administrativos, client secret Google, chave privada VAPID e segredo do cron pertencem aos scripts/servidor. Nunca devem entrar no frontend, nos logs públicos ou no Git. Se houver exposição, revogue ou rotacione a credencial; apagar o arquivo não a invalida.

`.env.local`, backups e relatórios operacionais ficam fora do versionamento. O verificador de segredos cobre padrões conhecidos nos arquivos rastreados e novos não ignorados, com opções para histórico e bundle. Não é um detector completo.

## Antes de divulgar uma instância

- Aplicar as migrações e publicar worker e frontend da mesma revisão, após backup e validação dos dados existentes.
- Confirmar RLS, permissões, URLs OAuth exatas, confirmação de e-mail, política de senhas e limites Auth no projeto alvo.
- Validar login, recuperação, duas contas, desconexão Calendar legada, notificações e modo offline no ambiente publicado.
- Configurar MFA dos administradores, acesso da equipe e backups com restauração verificada.
- Usar dados fictícios em demonstrações e screenshots.

Passos de publicação: [publicacao.md](publicacao.md). Relatos privados: [SECURITY.md](../SECURITY.md).
