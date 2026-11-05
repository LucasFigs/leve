# Melhorias de experiência — 05/11/2026

Esta revisão implementa os principais ajustes da [avaliação de produto](avaliacao-produto.md). As alterações são locais e precisam de deploy para chegar à instância pública.

## Capturar e começar

- Introdução reduzida a uma tela: nome, primeira captura e ajuste do período de planejamento são opcionais. É possível abrir o dia sem preencher nome ou tarefa.
- Cadastro sem exigência de nome completo ou celular; o nome de exibição é opcional.
- “Começar agora” inicia imediatamente o foco, preserva a data da ocorrência e retoma a mesma sessão sem zerar o tempo. Trocar de tarefa contabiliza a anterior.
- Cronômetro crescente é o padrão. Pomodoro, pausas e checklist ficam disponíveis sob demanda; dividir em passos não é uma etapa obrigatória.

## Recomendar e planejar

- O Agora só oferece tarefas que podem começar no momento e cabem na janela conhecida, respeitando próximos itens agendados, almoço e fim do período.
- Uma tarefa futura aparece como “Próxima agendada”, sem convite a iniciá-la antes do horário.
- Estados sem sugestão explicam a pausa, o fim do período ou a falta de uma janela suficiente, sem concluir que não existem pendências.
- Planejamento permite revisar disponibilidade no próprio painel e recalcula a proposta após alterações. Datas e durações continuam editáveis pelo usuário.
- As estimativas dizem que consideram somente itens do Leve, mostram a duração padrão e deixam claro que Google Agenda não importa os compromissos existentes.

As janelas de recomendação dependem dos registros e estimativas disponíveis. Elas não garantem que o usuário estará livre ou que uma duração estimada corresponda à realidade.

## Reduzir pressão e complexidade

- A próxima ação aparece antes do resumo de capacidade no Hoje.
- A visão semanal fica recolhida por padrão; sequências de produtividade deixam de ocupar o cabeçalho do Hoje.
- Pendências atrasadas convidam à revisão individual em vez de trazer tudo para hoje com um toque.
- Categoria fica recolhida na edição, filtros avançados ficam sob demanda e metadados redundantes são reduzidos nos cards. A busca e a opção de limpar filtros continuam visíveis.
- Recomendações continuam mostrando o motivo da escolha, mesmo quando há um próximo passo cadastrado.

## Acessibilidade

- Tokens de texto secundário ajustados para melhorar o contraste nos dois temas.
- Modais contêm Tab/Shift+Tab, isolam o conteúdo de fundo com inert e restauram o foco ao fechar.
- Modo foco usa o mesmo tratamento de teclado; atalhos globais não operam atrás de modais.
- Histórico de hábitos usa um botão nativo; campos de captura recebem identificadores únicos para os rótulos.

## Verificação e limites

Há testes de recomendação temporal, início direto, retomada, troca de tarefa, Pomodoro opcional, teclado dos modais, primeiro uso e recálculo de disponibilidade. Os testes de interface usam jsdom; não substituem avaliação visual, leitores de tela e aparelhos reais.

A suíte desta revisão passou com 75 testes em 10 arquivos. O build TypeScript/Vite passou e a auditoria npm retornou zero vulnerabilidades conhecidas na consulta realizada.

Não foi adicionado modo visitante à instância com Supabase. Isso exige definir separação e migração dos dados locais por conta, sem enfraquecer o isolamento existente. Também não se adicionaram analytics ou novas integrações. A validação de valor com usuários continua pendente.
