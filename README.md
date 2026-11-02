# Leve

> Tire tudo da cabeça. O Leve ajuda você a decidir o que fazer, quando fazer e como começar.

O Leve é um assistente pessoal para organizar tarefas, compromissos e hábitos sem transformar o planejamento em mais uma tarefa. Você registra o que está na cabeça, organiza o que importa e encontra um próximo passo possível para o seu dia.

## O que você ganha com o Leve

- **Menos coisas para lembrar:** capture tarefas rapidamente e organize-as depois, no Inbox.
- **Mais clareza para agir:** veja o que está planejado para hoje, o que está atrasado e qual tarefa faz sentido começar.
- **Planos que cabem no dia:** organize o dia ou a semana considerando duração, pausas e disponibilidade; reorganize o que mudou.
- **Acompanhamento em um só lugar:** reúna tarefas, compromissos, projetos e hábitos, com progresso e recorrências.
- **Foco na execução:** comece uma tarefa em modo foco, com Pomodoro e passos menores para tarefas grandes.
- **Acesso no celular e offline:** use como PWA instalável; os dados ficam no aparelho e o app pode ser usado sem uma conta.

## Como usar

1. **Capture:** no **Inbox**, anote rapidamente tudo o que precisa fazer. Você também pode criar uma tarefa com `N` ou usar a busca com `/` ou `Ctrl K`.
2. **Organize:** revise as capturas e defina data, horário, duração, prioridade ou projeto. Quando uma tarefa não tiver data, deixe-a para “Quando der”.
3. **Planeje:** em **Hoje** ou **Agenda**, organize o dia ou a semana. O Leve mostra o que está previsto e ajuda a escolher por onde começar.
4. **Faça:** inicie uma tarefa, acompanhe os passos e marque-a como concluída. Se os planos mudarem, replaneje ou reorganize o restante do dia.
5. **Acompanhe:** use **Projetos** para visualizar o progresso de objetivos maiores e **Hábitos** para registrar recorrências e sequências.

Você pode escrever tarefas em linguagem natural em português, por exemplo: `Enviar o relatório amanhã às 14h`. O Leve interpreta informações como data, horário, duração, prioridade e recorrência para ajudar a preencher a tarefa.

## Começar no computador

Você precisa de [Node.js](https://nodejs.org/) e npm.

```bash
git clone <url-do-repositorio>
cd leve
npm install
npm run dev
```

Abra no navegador o endereço informado pelo Vite (normalmente `http://localhost:5173`). Para testar em um celular conectado à mesma rede, use o endereço de rede exibido pelo servidor.

Comandos úteis:

```bash
npm test          # executa os testes
npm run build     # verifica os tipos e gera o build de produção
npm run preview   # abre localmente o build gerado
```

## Usar no celular

Depois de publicar o app, abra o endereço no navegador do celular e instale-o na tela inicial:

- **Android (Chrome):** menu ⋮ → **Instalar app**.
- **iPhone (Safari):** **Compartilhar** → **Adicionar à Tela de Início**.

## Sincronização e login (opcional)

Sem configurar o Supabase, o Leve funciona no próprio aparelho e salva os dados localmente. Para usar login e sincronizar os dados entre dispositivos, configure um projeto Supabase:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_ACCESS_TOKEN`.
3. Execute:

   ```bash
   npm run setup:supabase
   ```

O script configura o schema em `supabase/schema.sql`, as políticas de acesso por usuário, a sincronização em tempo real e o login. Para habilitar login com Google, configure também `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

`SUPABASE_ACCESS_TOKEN` e `GOOGLE_CLIENT_SECRET` são usados apenas localmente pelo script. **Nunca os publique nem os configure na Vercel.** No app publicado, configure somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; o acesso aos dados é protegido pelas políticas RLS do banco.

## Publicar na Vercel

1. Envie o repositório ao GitHub e importe-o em [vercel.com/new](https://vercel.com/new). A Vercel detecta o Vite e usa as configurações de `vercel.json`.
2. Se configurou o Supabase, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` às variáveis de ambiente do projeto na Vercel.
3. Depois do primeiro deploy, configure o endereço público como `APP_URL` no `.env.local` e execute `npm run setup:supabase` novamente para autorizar esse endereço no login.

## Lembretes por notificação (opcional)

Em **Perfil → Lembretes**, escolha quantos minutos antes do horário quer ser avisado. Sem configurar push, o lembrete depende de o app estar aberto ou ter sido usado recentemente. Com push configurado, as notificações podem chegar com o app fechado; no iPhone, é necessário iOS 16.4 ou posterior e o app instalado na tela inicial.

Para configurar push uma vez por projeto:

1. Configure `SUPABASE_ACCESS_TOKEN` no `.env.local`.
2. Execute `npm run setup:push`. O script gera as chaves, cria as tabelas de `supabase/push.sql`, publica a função `send-reminders` e agenda sua execução.
3. Adicione a variável `VITE_VAPID_PUBLIC_KEY` exibida pelo script às variáveis da Vercel e faça um novo deploy.
4. Ative **Perfil → Lembretes** em cada aparelho.

Se alterar as regras de lembrete em `src/domain`, execute `npm run setup:push` novamente para republicar a função.

## Atalhos

- `N`: capturar uma tarefa.
- `/` ou `Ctrl K`: abrir a busca.
- `1`–`5`: navegar entre as telas principais.

## Estrutura do projeto

- `src/domain`: regras de negócio testáveis, como interpretação de tarefas, prioridades, planejamento, recorrências e busca.
- `src/services`: integração da interface com os serviços de assistência.
- `src/store`: estado, ações, persistência local e sincronização com Supabase.
- `src/components`, `src/screens` e `src/sheets`: componentes, telas e painéis da interface.
- `supabase`: schema do banco, scripts SQL e função de lembretes.
