# Visualização de tarefas

Refino de 05/11/2026 para favorecer leitura e execução, mantendo a edição como ação explícita.

- O título é o elemento principal. Prioridade, categoria, projeto, identificação do hábito e estado aparecem como contexto discreto, sem a ficha de linhas que ocupava o centro do modal.
- Planejamento reúne dia, intervalo de horário e duração em uma faixa compacta. A frequência permanece visível nas recorrências; o prazo tem sua própria linha, com alerta quando pertinente. Estimativas sem duração explícita usam o padrão configurado.
- Passos vêm antes das notas. Toda a linha funciona como checkbox, com destaque discreto no próximo pendente, progresso e contagem atualizados imediatamente. Notas continuam como texto simples, preservando quebras de linha.
- Tarefas simples não mostram blocos vazios ou instruções permanentes. Outras ações fica em uma expansão discreta; arquivar e excluir continuam separados da execução.
- Rodapé mais compacto, mantendo Começar agora, Concluir e Adiar, além dos estados próprios para compromissos, itens concluídos e arquivados.
- O foco inicial vai ao título para apresentar o contexto da consulta. Os controles mantêm foco visível e navegação contida no modal. Alterações de passos preservam a visualização e a ocorrência selecionada.

A apresentação foi extraída para `TaskOverview`, separada do formulário e dos fluxos de edição/recorrência. Os estilos específicos da consulta usam uma classe própria do BottomSheet, preservando os outros modais.

Validação: 121 testes passaram e build TypeScript/Vite aprovado. Foram conferidos no Edge headless os temas claro/escuro, desktop de 1280 px e celulares de 320, 360 e 390 px, com título longo, notas, múltiplos passos, hábito, compromisso e tarefa simples. Sem transbordamento horizontal ou botões aninhados; o rodapé permaneceu dentro da janela. No exemplo curto, o conteúdo ficou inteiramente visível sem rolagem. A prévia usou dados fictícios e Supabase desativado; não substitui conferência em aparelho físico e leitor de tela.

Alterações locais, sem publicação na Vercel nesta revisão.
