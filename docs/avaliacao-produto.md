# Avaliação de produto, valor e usabilidade do Leve

Data: 05/11/2026. Revisão de código, fluxos e CSS. Não houve inspeção visual da interface renderizada, teste de dispositivo, entrevista ou observação de usuários. Benefícios e impacto descritos como potenciais não equivalem a resultados medidos. Nenhuma funcionalidade foi alterada nesta avaliação.

Atualização posterior: as intervenções feitas a partir desta análise estão em [melhorias-experiencia.md](melhorias-experiencia.md). Os achados abaixo registram a revisão anterior às mudanças.

## Parecer

O núcleo mais consistente do Leve é ajudar uma pessoa a tirar pendências da cabeça, decidir uma próxima ação e adaptar o plano ao tempo disponível. Captura, Hoje, planejamento e replanejamento sustentam essa proposta. A amplitude de funcionalidades está mais desenvolvida que a validação da experiência de primeiro uso e da confiança nas recomendações.

Minha hipótese de público inicial é quem concilia tarefas pessoais e profissionais e se perde entre listas e horários. Não há evidência suficiente para posicioná-lo como ferramenta de gestão de equipes, substituto completo do calendário ou solução clínica para dificuldades de atenção.

Promessa recomendada: **“Saiba o que fazer agora e reorganize seu dia quando os planos mudarem.”**

## Valor e escopo

| Recurso | Valor potencial | Decisão sugerida |
| --- | --- | --- |
| Captura em português com chips editáveis | Menos esforço para registrar e corrigir interpretações | Manter como entrada principal |
| Card Agora com motivo da sugestão | Reduzir o esforço de escolher o próximo passo | Priorizar a coerência temporal e a explicação |
| Capacidade do dia e plano com folgas | Evitar planejar mais do que cabe | Manter e validar disponibilidade/estimativas |
| Replanejamento com desfazer | Recuperar um dia interrompido sem recomeçar a organização | Tratar como diferencial central |
| Agenda dia/semana/mês | Entender a distribuição do tempo | Dia e semana em destaque; mês secundário |
| Inbox | Registrar sem decidir tudo na hora | Manter, simplificando a revisão |
| Tarefas e filtros | Recuperar e administrar o acervo | Manter como biblioteca secundária |
| Projetos | Agrupar tarefas de um objetivo | Manter simples, sem expandir para gestão complexa |
| Hábitos e heatmaps | Acompanhar consistência | Camada opcional, fora do primeiro uso |
| Subtarefas e divisão sugerida | Diminuir a barreira de tarefas grandes | Disponível sob demanda, sem etapa obrigatória |
| Pomodoro | Ajudar quem gosta de blocos de foco | Opcional, separado do ato de começar |
| Google Agenda e push | Reduzir troca de ferramentas e esquecimentos | Manter, deixando explícitos limites e estado |
| Categorias, prioridades, projetos e demais metadados | Organização detalhada | Mostrar gradualmente e permitir ignorar |
| Sequências de produtividade | Motivação para parte do público | Evitar tratá-las como medida principal de sucesso |

O que sobra é principalmente a obrigatoriedade, a exposição e a duplicação de decisões. Não há evidência para eliminar Hábitos ou Projetos só porque acrescentam telas. Antes, simplificar a experiência padrão e observar uso real. Não priorizaria chat de IA, colaboração, novos dashboards ou mais filtros agora.

## Pontos fortes observados

- Captura com interpretação visível em chips, opção de descartar partes e caminho para detalhar antes de salvar (`QuickAdd.tsx`).
- Recomendações acompanhadas de motivo e opção de escolher outra tarefa (`Today.tsx`).
- Plano com prévia e aplicação explícita, mais desfazer depois da mudança (`PlanningSheets.tsx`).
- Planejador reserva margem: fator de carga de 80%, transições de 10 minutos e pausas após blocos de trabalho (`planner.ts`). São escolhas úteis de produto, não evidência de que esses valores sirvam a todas as rotinas.
- Linguagem acolhedora, inclusive ao adiar tarefas, e distinção entre tarefa concluída e compromisso que aconteceu.
- Sistema visual com tokens, temas claro/escuro, hierarquia tipográfica, componentes compartilhados, foco visível e preferência por movimento reduzido.
- Adaptação de navegação, modal e agenda ao tamanho da tela; a qualidade visual final dessa adaptação ainda precisa de inspeção em navegador.

## Problemas prioritários

### 1. “Começar agora” exige preparação e não começa o foco

Evidência: `focusFlow.ts` sempre abre `BreakdownSheet`; o sheet inicia a sessão com `running=false`; o usuário ainda precisa acionar o cronômetro. Isso contraria a mensagem do onboarding de começar com um toque.

Proposta: começar a execução diretamente ou oferecer escolha clara entre “Iniciar foco” e “Dividir em passos”. Subtarefas e Pomodoro não devem ser pré-requisitos para tarefas simples, como enviar uma mensagem. Preservar o caminho de preparação para quem o escolher.

### 2. A recomendação “Agora” pode antecipar indevidamente tarefas futuras

Evidência: `scoreItem`, em `priority.ts`, dá grande bônus a tarefas com horário ainda futuro. Uma tarefa às 18h pode superar uma tarefa essencial sem horário às 9h; no Hoje, ambas acabam associadas ao CTA “Começar agora”.

Proposta: separar “Melhor ação neste momento” de “Próxima agendada”. Considerar duração e janela disponível como critérios de elegibilidade; evitar recomendar começar antes de um horário fixo sem uma escolha explícita. Testar cenários de compromisso próximo, tarefa vencida, dia encerrado e lista vazia.

### 3. Capacidade do dia pode transmitir certeza excessiva

Evidência: o onboarding pede essencialmente o nome; disponibilidade e duração padrão vêm das configurações iniciais. O Google Agenda lista calendários e recebe eventos do Leve, mas não importa os compromissos existentes para bloquear tempo no planejador.

Proposta: configurar disponibilidade com uma pergunta breve no primeiro planejamento, mostrar a duração presumida e indicar “com base nos itens do Leve”. Se o calendário externo não for consultado, dizer isso junto da integração e da estimativa de tempo livre. Nunca apresentar horário como livre apenas porque o app desconhece um compromisso externo.

### 4. O primeiro valor chega depois de autenticação e apresentação

Evidência: com Supabase configurado, `App.tsx` direciona o visitante sem sessão para Login antes do onboarding; cadastro pede nome completo, apelido, celular opcional, e-mail, senha e confirmação.

Proposta: demonstração com dados fictícios ou teste local como visitante, com decisão explícita sobre mesclar/salvar dados ao criar conta. Reduzir o cadastro aos dados necessários; não coletar celular sem uma finalidade clara no produto. Depois de uma captura, mostrar o resultado e como começar a tarefa, em vez de explicar todas as funções antecipadamente.

### 5. Complexidade e nomenclatura competem com a proposta de leveza

Evidência: sete destinos no desktop; Tarefas/Hábitos/Projetos sob uma segunda seleção no mobile; filtros de tipo, prioridade, projeto e categoria; ações com nomes próximos como organizar capturas, organizar dia, reorganizar e encaixar horários.

Proposta: Hoje como ponto de ação, Agenda como visão do tempo, Inbox como revisão e Tarefas como acervo. Manter recursos avançados recolhidos até o usuário precisar deles. Padronizar nomes pelo efeito: “Revisar capturas”, “Planejar horários” e “Replanejar restante”. A decisão de remover destinos exige teste, não só contagem de telas.

## UI e acessibilidade

### Contraste

Cálculo a partir dos tokens do CSS: `#8b8b98` sobre branco tem aproximadamente **3,36:1**; sobre `#f4f4f6`, **3,06:1**. No tema escuro, `#75757f` sobre `#17171b` tem **3,92:1**. São combinações insuficientes para texto normal que precise atingir 4,5:1. O uso de `--text-3` em descrições pequenas merece revisão; o resultado completo depende do fundo e tamanho reais.

### Teclado e modais

`BottomSheet` recebe e devolve foco, oferece Escape e `aria-modal`, mas não contém a sequência Tab/Shift+Tab nem torna o fundo inerte. Isso permite sair do modal pelo teclado apesar da semântica modal.

O heatmap de Hábitos abre o calendário por um `div` com `role=button` e `tabIndex=0`, sem tratamento de Enter/Espaço nesse elemento. Preferir botão nativo. As células de 10 px do heatmap são elementos visuais dentro do alvo maior; não devem ser confundidas com botões individuais de 10 px.

### Densidade e hierarquia

O Hoje combina captura, capacidade, Agora, atrasadas/sugestões, lista do dia e semana, além da timeline no desktop. Proposta: fazer a próxima ação dominar a leitura, manter capacidade como resumo e recolher semana/concluídas. Evitar várias mensagens simultâneas dizendo ao usuário o que fazer.

TaskCard pode reunir horário, duração, tipo, recorrência, subtarefas, categoria, projeto, prioridade e adiamentos. Priorizar título, horário/duração e uma informação contextual; detalhes completos ficam na edição.

Essas são recomendações a partir da estrutura do layout, não conclusões de uma sessão visual. Ainda é preciso testar recorte de textos, zoom de 200%, teclado móvel, rolagem da agenda, toques e estados de conexão em aparelhos reais.

## Ordem de evolução

1. **Promessa principal:** simplificar começar uma tarefa; corrigir recomendação temporal e explicitar a base do tempo livre.
2. **Acesso e legibilidade:** corrigir modais/teclado/contraste e reduzir obstáculos do primeiro uso.
3. **Clareza:** reorganizar o Hoje, padronizar ações e recolher campos avançados.
4. **Validação:** observar uso por uma semana antes de expandir integrações ou funcionalidades.

Não há dados para prometer mais produtividade ou definir impacto financeiro. O benefício a demonstrar é menor esforço de organização com mais decisões úteis e execução possível, sem aumentar a pressão por concluir tudo.

## Teste de valor com usuários

Começar com cinco participantes do público pretendido para uma rodada qualitativa, sem tratar esse número como validação estatística. Usar tarefas fictícias e observar:

1. Registrar “Enviar relatório amanhã às 14h” e corrigir uma interpretação.
2. Decidir a próxima ação entre uma tarefa importante sem horário e uma agendada para mais tarde.
3. Planejar um dia com tempo insuficiente, identificar o que mudou e desfazer.
4. Começar uma tarefa simples e uma grande.
5. Adiar uma tarefa recorrente sem alterar toda a série.
6. Explicar o que a conexão Google inclui e o que continua fora do Leve.

Medir tempo até a primeira captura e primeiro início, quantidade de intervenções, erros, entendimento das sugestões e esforço percebido. Durante uma semana, observar retornos para replanejar, correções manuais do plano e utilidade percebida. Visitas, número bruto de tarefas e streaks isoladamente não demonstram que o app ajudou.

Se houver instrumentação, usar eventos agregados e consentimento apropriado, sem enviar títulos, notas ou conteúdo de calendários para analytics.

## Referências

- [W3C: contraste](https://w3c.github.io/wcag/understanding/contrast-minimum).
- [W3C: comportamento de modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- [NN/g: mostrar complexidade gradualmente](https://www.nngroup.com/articles/progressive-disclosure/).
