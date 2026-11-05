# Rascunho para LinkedIn

Use o texto depois de confirmar que a instância pública recebeu a revisão e testar os fluxos do guia de [publicação](publicacao.md). Para as imagens, use dados fictícios e confira também informações pessoais na interface.

---

Como transformar uma lista de tarefas em um plano que cabe no dia?

Essa pergunta guiou o desenvolvimento do Leve, meu projeto pessoal de organização de tarefas, compromissos e hábitos.

A ideia é reduzir o esforço entre lembrar de algo e começar a fazer: capturar em linguagem natural em português, organizar prioridades, planejar conforme a disponibilidade e acompanhar a execução.

Também refinei o produto para que a organização não virasse mais uma tarefa: a tela inicial destaca o essencial, os passos podem ser concluídos sem entrar na edição e os hábitos têm um calendário visual próprio, com cores e ícones personalizáveis.

No desenvolvimento, trabalhei com React e TypeScript, persistência local, recorrências, planejamento de atividades, sincronização com Supabase e integração com Google Agenda. O aplicativo também pode ser instalado como PWA.

Uma das partes mais interessantes foi separar as regras de negócio da interface. A interpretação de tarefas e o planejamento usam heurísticas locais, o que permite testar essas decisões e executá-las sem depender de uma API de IA.

Antes de ampliar a divulgação, revisei também o ciclo de autenticação, o isolamento entre usuários, as integrações e as dependências. Esse trabalho trouxe testes de regressão e reforçou um aprendizado: segurança precisa acompanhar a evolução do produto.

O Leve continua em desenvolvimento. Quero seguir melhorando a experiência com uso real e feedback.

Experimente: https://leve-flame.vercel.app
Código: https://github.com/LucasFigs/leve

A integração com Google Agenda está em testes com contas autorizadas; os demais recursos podem ser usados sem conectá-la.

O que mais dificulta seu planejamento hoje: capturar as tarefas, decidir prioridades ou reorganizar o dia quando os planos mudam?

#React #TypeScript #DesenvolvimentoWeb #ProjetosPessoais
