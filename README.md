# Leve

> Tire tudo da cabeça. Organize o que importa e encontre um próximo passo possível para o seu dia.

Assistente pessoal de tarefas, compromissos e hábitos, desenvolvido com React e TypeScript. O Leve reúne captura em português, planejamento por disponibilidade, recorrências e modo foco em uma PWA com persistência local e sincronização opcional.

**Estado:** projeto pessoal em desenvolvimento, com testes automatizados e revisão contínua da experiência. Consulte o [guia de publicação](docs/publicacao.md) para validar a versão hospedada antes da divulgação.

[Acessar o Leve](https://leve-flame.vercel.app) · [Arquitetura](docs/arquitetura.md) · [Segurança](docs/seguranca.md)

## O que o Leve faz

- Captura tarefas em linguagem natural em português, como `Enviar relatório amanhã às 14h`.
- Organiza tarefas, compromissos, projetos e hábitos em um só lugar.
- Mantém a lista do dia enxuta, com detalhes e passos disponíveis ao abrir cada tarefa.
- Acompanha hábitos em um calendário de realizações, com histórico em quadradinhos, cores e ícones personalizáveis.
- Planeja o dia e a semana considerando horários, duração e disponibilidade.
- Acompanha recorrências, prioridades e execução com modo foco/Pomodoro.
- Funciona no navegador e pode ser instalado como PWA.
- Oferece sincronização entre dispositivos via Supabase, envio para Google Agenda e lembretes push quando configurados.

O assistente usa regras e heurísticas locais. Não depende de uma API de IA generativa. A integração com Google Agenda envia alterações do Leve para o calendário; não importa automaticamente alterações feitas no Google.

O Google Agenda está em testes e disponível apenas para contas autorizadas; nesse modo, a autorização pode expirar após sete dias. O login Google solicita apenas dados básicos de identidade, separadamente do calendário. A conexão com a agenda é opcional para usar o Leve.

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

O Google Agenda pode ser conectado no Perfil. Com o backend da integração configurado, o vínculo é restaurado ao reabrir o app: o refresh token fica cifrado no servidor e o access token permanece somente em memória. Veja [configuração e limites](docs/google-agenda.md).

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
  sheets/       Painéis de visualização e edição
supabase/
  functions/    Integração Google Agenda e worker de lembretes
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
- [Melhorias de experiência](docs/melhorias-experiencia.md)
- [Auditoria de integridade e confiabilidade](docs/auditoria-evolucao.md)
- [Jornada essencial](docs/jornada-essencial.md)
- [Checklist de validação e rollout](docs/checklist-publicacao.md)

Este projeto evolui com testes e revisão. Nenhuma dessas verificações garante ausência de vulnerabilidades. Use dados fictícios nas demonstrações e confirme que o ambiente hospedado recebeu as mudanças antes de divulgar uma nova revisão.
