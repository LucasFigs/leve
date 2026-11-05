# Revisão do modal de tarefas

05/11/2026. O formulário foi reorganizado para facilitar a passagem da captura à ação, mantendo a consulta da tarefa separada da edição.

## Hierarquia

1. **O que fazer:** título em destaque, tipo e uma explicação curta da diferença entre tarefa, compromisso e hábito.
2. **Planejamento:** atalhos Hoje/Amanhã/Quando der, dia, horário, duração e prioridade agrupados. O calendário continua permitindo qualquer outra data. A duração mostra a estimativa efetiva e permite personalizar ou voltar ao padrão.
3. **Detalhes sob demanda:** repetição, passos, notas e organização. Projeto, categoria e prazo ficam juntos; o resumo mostra valores já escolhidos sem abrir todos os campos. Notas e passos existentes abrem na edição. Para hábitos, a frequência permanece diretamente visível.
4. **Rodapé:** Criar/Salvar como ação principal e Cancelar como secundária. Arquivar e excluir ficam em Outras ações. Capturas informam onde o item ficará ao salvar.

Os campos existentes continuam disponíveis. A criação só exige título; organizar para um dia, projeto, repetição ou Quando der é opcional. Hábitos exigem repetição para aparecer corretamente no acompanhamento. Uma captura sem destino continua no Inbox.

## Correções de interação

- Notas, configurações e passos digitados acionam a proteção de descarte mesmo quando o título está vazio.
- Salvar também inclui um passo ainda digitado no campo Novo passo, sem exigir Adicionar antes. Cancelar uma edição limpa esse rascunho.
- Duração personalizada aceita somente minutos inteiros dentro do limite do modelo e impede salvamento inválido. O horário final considera a duração padrão configurada no app.
- A interface diferencia dia planejado de prazo e avisa quando o planejamento está depois da entrega, sem impedir replanejamento legítimo.
- IDs dos campos são exclusivos; rótulos, foco visível, estados selecionados e nomes acessíveis acompanham os controles.
- Título e textos dos passos crescem com o conteúdo e com a largura da janela, inclusive após expandir painéis, sem rolagem interna. Enter para adicionar passo respeita composição de texto; Ctrl/Cmd+Enter permite salvar na edição.

## Validação

107 testes de domínio e interface passaram, incluindo proteção de rascunho, passo pendente, cancelamento, duração inválida, configuração de hábito e manutenção do alcance das alterações em séries. Build TypeScript/Vite aprovado.

A interface foi renderizada no Edge headless com dados fictícios, sem conexão com Supabase. Conferidos temas claro/escuro, desktop, larguras de celular de 320, 360 e 390 px, títulos e passos longos, hábito recorrente e altura reduzida de 480 px. Não foi observado transbordamento horizontal dos controles; o rodapé permaneceu dentro da janela. Esses testes não reproduzem teclado virtual, Safari/iOS, leitor de tela ou aparelho físico.

As alterações são locais; esta revisão não publica o frontend na Vercel.
