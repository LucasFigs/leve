# Leve

> Tire tudo da cabeça. O app ajuda você a decidir o que fazer, quando fazer e como começar.

Assistente pessoal mobile-first para agenda, tarefas, priorização e execução.

## Rodar

```bash
npm install
npm run dev       # desenvolvimento (abre também na rede local: teste no celular)
npm run build     # build de produção (PWA instalável, funciona offline)
npm run preview   # serve o build
npm test          # testes (interpretador de linguagem natural e planejamento)
npm run setup:supabase  # configura o Supabase a partir do .env.local
```

## Nuvem (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   e `SUPABASE_ACCESS_TOKEN` (token pessoal, só para o script abaixo).
3. Rode `npm run setup:supabase` — cria a tabela (`supabase/schema.sql`) com segurança por usuário,
   liga o tempo real e configura o login (e o Google, se `GOOGLE_CLIENT_ID/SECRET` estiverem preenchidos).

Sem as variáveis `VITE_SUPABASE_*` o app funciona só no aparelho.

## Deploy na Vercel

1. Suba o código para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório (a Vercel detecta Vite; `vercel.json` já configura tudo).
3. Em **Environment Variables**, adicione **só** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (a chave anon é pública por design; a segurança vem das regras RLS do banco).
   Nunca coloque `SUPABASE_ACCESS_TOKEN` nem `GOOGLE_CLIENT_SECRET` na Vercel.
4. Depois do primeiro deploy, coloque o endereço em `APP_URL` no `.env.local` e rode
   `npm run setup:supabase` de novo — libera o login (e-mail e Google) nesse endereço.

## Usar como app no celular

Abra o endereço da Vercel no celular:

- **Android (Chrome):** avatar → Perfil → *Instalar app* (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*.

Atalhos no desktop: `N` captura · `/` ou `Ctrl K` busca · `1`–`5` navegação.

## Arquitetura

```
src/
  domain/      Regras puras, sem UI (testáveis)
    parser.ts      Linguagem natural pt-BR → título, tipo, data, hora, duração, recorrência, prioridade
    priority.ts    “Qual a próxima coisa que faz sentido fazer?” (score + motivo)
    planner.ts     Organizar meu dia / semana, replanejamento, folgas e pausas
    organize.ts    Sugestões para as capturas do Inbox
    breakdown.ts   Quebra de tarefas grandes em passos
    selectors.ts   Recorrência, itens do dia, atrasadas, progresso
    search.ts      Busca global com linguagem natural
  services/
    assistant.ts   Fronteira da “inteligência”: troque por uma implementação com IA sem mexer na UI
  store/
    store.ts       Estado + ações (com desfazer)
    persistence.ts Cache local (localStorage) — app abre e funciona offline
    sync.ts        Login + sincronização com o Supabase (por item, tempo real)
    ui.ts          Estado efêmero de interface (abas, sheets, toasts)
  components/  Componentes reutilizáveis (TaskCard, QuickAdd, BottomSheet, DayTimeline…)
  screens/     Hoje, Agenda, Inbox, Projetos, Perfil, Foco, Onboarding
  sheets/      Detalhe da tarefa, Organizar dia/semana/capturas, Replanejar, Dividir, Busca
```

Próximos passos naturais: `Assistant` com LLM,
integração com Google/Apple Calendar, notificações push via service worker, widgets.
