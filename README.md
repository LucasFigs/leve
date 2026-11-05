# Leve

> Tire tudo da cabeça. Organize o que importa e encontre um próximo passo possível para o seu dia.

Assistente pessoal de tarefas, compromissos e hábitos, desenvolvido com React e TypeScript. O Leve reúne captura em português, planejamento por disponibilidade, recorrências e modo foco em uma PWA com persistência local e sincronização opcional.

**Estado:** projeto em desenvolvimento. As correções desta revisão passaram em testes locais; sua aplicação na infraestrutura e a validação da instância pública ainda estão pendentes. Consulte [publicação](docs/publicacao.md) antes de divulgar o link de demonstração.

## O que o Leve faz

- Captura tarefas em linguagem natural em português, como `Enviar relatório amanhã às 14h`.
- Organiza tarefas, compromissos, projetos e hábitos em um só lugar.
- Planeja o dia e a semana considerando horários, duração e disponibilidade.
- Acompanha recorrências, prioridades e execução com modo foco/Pomodoro.
- Funciona no navegador e pode ser instalado como PWA.
- Oferece sincronização entre dispositivos via Supabase, envio para Google Agenda e lembretes push quando configurados.

O assistente usa regras e heurísticas locais. Não depende de uma API de IA generativa. A integração com Google Agenda envia alterações do Leve para o calendário; não importa automaticamente alterações feitas no Google.

## Tecnologias e decisões

| Área | Implementação |
| --- | --- |
| Interface | React 18 e TypeScript |
| Build e desenvolvimento | Vite |
| Regras do produto | Módulos de domínio independentes da interface |
| Persistência | Armazenamento no navegador, com uso offline |
| Nuvem opcional | Supabase Auth, Postgres com RLS e Realtime |
| Integrações | Google Calendar API e Web Push |
| Qualidade | Vitest, testes SQL em PostgreSQL isolado e GitHub Actions |

Leia a [arquitetura](docs/arquitetura.md) para entender o fluxo entre essas partes.

## Executar localmente

Use Node.js **22.12 ou superior**, compatível com as dependências, e npm.

```bash
git clone https://github.com/LucasFigs/leve.git
cd leve
npm ci
npm run dev
```

Abra o endereço informado pelo Vite. Sem configurar o Supabase, o aplicativo funciona localmente e salva os dados no navegador. Nenhuma credencial é necessária para esse modo.

O servidor de desenvolvimento escuta apenas no computador local. Para um teste intencional na rede doméstica, use `npm run dev -- --host 0.0.0.0` e encerre o servidor ao terminar.

## Configuração opcional

Copie `.env.example` para `.env.local` e preencha somente as integrações que pretende usar. Não versione o arquivo preenchido.

| Variável pública | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/publishable; acesso protegido pelas políticas do banco |
| `VITE_GOOGLE_CLIENT_ID` | Cliente OAuth para Google Agenda |
| `VITE_VAPID_PUBLIC_KEY` | Chave pública das notificações push |

Variáveis `VITE_*` entram no frontend. Os demais segredos do template são usados pelos scripts/servidor e não devem ser importados para a Vercel nem publicados.

### Supabase

Em um projeto próprio, configure `SUPABASE_ACCESS_TOKEN` e `APP_URL` e execute `npm run setup:supabase`. O script aplica o schema e políticas RLS e ajusta autenticação, URLs de retorno, confirmação de e-mail e política de senha. Para habilitar login Google, preencha também `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e configure o cliente no Google Cloud.

**Esse comando altera o projeto remoto configurado.** Em um ambiente existente, faça backup e revise os dados antes de executar. Um deploy do frontend não aplica essas alterações.

### Google Agenda e push

O Google Agenda pode ser conectado no Perfil. O token permanece somente na memória da aba; é necessário reconectar ao recarregar o app ou trocar de conta.

Para push, `npm run setup:push` gera as chaves necessárias, aplica tabelas, publica a função e agenda o processamento no projeto Supabase. Mantenha a chave privada e o segredo do cron fora do frontend. Depois configure apenas `VITE_VAPID_PUBLIC_KEY` na Vercel e ative os lembretes no aparelho.

Notificações dependem das permissões e do suporte do navegador/dispositivo. Use `npm run setup:push -- --bundle` para gerar somente o pacote local da função, sem publicar ou alterar o Supabase.

## Comandos

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Servidor local |
| `npm test` | Testes de domínio, integrações e regressões de segurança |
| `npm run build` | Verificação TypeScript e build em `dist/` |
| `npm run preview` | Prévia local do build |
| `npm run test:database` | Testes SQL em container temporário; Windows/PowerShell e Docker |
| `npm audit` | Consulta de vulnerabilidades conhecidas nas dependências |
| `npm run check:secrets -- --dist --history` | Verificação de padrões de segredos, bundle e histórico Git |
| `npm run setup:push -- --bundle` | Regeneração local do worker |

O runner SQL usa PostgreSQL 16 com papéis e `auth.uid()` de teste. Ele verifica políticas, permissões, validações e quotas; não testa os serviços Auth/Realtime, cron nem a entrega real de push.

## Estrutura

```text
src/
  domain/       Regras de negócio e validação
  services/     Assistente local e integrações
  store/        Estado, persistência e sincronização
  screens/      Telas do produto
  components/   Componentes reutilizáveis
  sheets/       Painéis de edição
supabase/
  functions/    Worker de lembretes
  tests/        Isolamento e validação SQL
scripts/        Preparação e verificação
public/         PWA e páginas institucionais
docs/           Arquitetura, segurança e publicação
```

## Segurança e contribuição

- [Controles e limitações](docs/seguranca.md)
- [Relatar uma vulnerabilidade](SECURITY.md)
- [Contribuir e validar mudanças](CONTRIBUTING.md)
- [Preparar o repositório e publicar](docs/publicacao.md)
- [Rascunho para o LinkedIn](docs/publicacao-linkedin.md)

Este projeto evolui com testes e revisão. Nenhuma dessas verificações garante ausência de vulnerabilidades. Use dados fictícios nas demonstrações e confirme que o ambiente hospedado recebeu as mudanças antes de divulgar uma nova revisão.
