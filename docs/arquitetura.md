# Arquitetura

O Leve é uma SPA em React e TypeScript, empacotada pelo Vite. A interface coordena módulos de domínio que rodam no navegador. O assistente atual usa regras e heurísticas locais; não depende de um modelo generativo nem de uma API de IA.

```mermaid
flowchart TD
  UI[Telas e componentes React] --> Store[Estado e ações]
  UI --> Assistant[Assistente local]
  Assistant --> Domain[Regras de domínio]
  Store --> Local[Persistência no navegador]
  Store <--> Sync[Sincronização opcional]
  Sync <--> Supabase[Supabase Auth, Postgres e Realtime]
  Store --> Calendar[Integração Google Agenda]
  Calendar --> Google[Google Calendar API]
  Supabase --> Worker[Worker de lembretes]
  Worker --> Push[Serviço push do navegador]
```

| Diretório | Responsabilidade |
| --- | --- |
| `src/domain` | Interpretação de texto, datas, recorrências, priorização, planejamento e validação |
| `src/services` | Assistente local, Google Agenda e notificações |
| `src/store` | Estado, ações, persistência e sincronização por entidade |
| `src/screens` | Telas do produto |
| `src/components` e `src/sheets` | Componentes reutilizáveis e painéis de edição |
| `supabase` | Schema, políticas de acesso, worker e testes SQL |
| `scripts` | Preparação de infraestrutura, verificações e geração de artefatos |

A persistência local permite uso sem backend configurado. Com Supabase, o cliente mantém um diário de alterações pendentes, sincroniza entidades e recebe atualizações por Realtime. As políticas RLS do banco fazem a autorização; os filtros do cliente são uma camada adicional.

A integração Google envia alterações do Leve para o calendário escolhido. Ela não importa automaticamente alterações feitas no Google. Autorizações ficam em memória por aba e são descartadas ao encerrar ou trocar a sessão.

O worker reutiliza as regras de lembretes do domínio. `source.ts` é o código editável; `index.ts` é o pacote gerado para publicação. Os testes SQL usam um PostgreSQL isolado com papéis e `auth.uid()` de teste, sem substituir a validação dos serviços reais do Supabase.
