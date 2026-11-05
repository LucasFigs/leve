# Revisão de jornada e usabilidade

Revisão de código e fluxos em 05/11/2026, dando continuidade à avaliação de produto e aos ajustes anteriores. Não equivale a um teste visual ou a uma pesquisa com usuários.

## Direção do produto

A jornada principal permanece: capturar sem precisar organizar tudo, escolher uma ação possível, executar com passos opcionais e reorganizar quando necessário. Hoje conduz a execução; Inbox guarda o que ainda precisa de decisão; Agenda mostra a distribuição; Tarefas permite recuperar o acervo. Projetos, Hábitos e Pomodoro continuam como recursos opcionais.

## Correções desta rodada

- Capturas e projetos pedem confirmação antes de descartar um rascunho ao fechar pelo fundo, botão, Escape ou gesto do cabeçalho.
- A busca permite alcançar resultados além dos primeiros 40, reiniciando o limite a cada consulta. O campo diz que busca tarefas e projetos, evitando sugerir um chat de IA.
- O conteúdo dos modais fica reservado à rolagem e seleção de texto; o gesto de fechar continua no cabeçalho e na alça.
- A agenda semanal separa os botões de expandir e adicionar, corrigindo botões aninhados. A expansão informa seu estado e o conteúdo controlado às tecnologias assistivas.
- A agenda vazia informa que não há registros no Leve, sem afirmar que a pessoa está livre.
- Tarefas distingue ausência de itens abertos, concluídos e resultados filtrados, oferecendo uma ação contextual.
- A navegação tem um atalho para pular ao conteúdo; atalhos globais ignoram teclas repetidas, composição de texto e eventos já tratados.
- A captura também respeita composição de texto ao receber Enter.
- O seletor de cores de projetos tem nomes em português, área maior e foco visível; a cor da barra do navegador acompanha mudanças do tema do sistema.
- Abrir outra ocorrência da mesma tarefa ou outro projeto reinicializa o formulário correspondente. A conclusão animada de um card ignora cliques repetidos enquanto sai da lista.

## Decisões confirmadas

O usuário escolheu manter a comparação entre semanas. Uma demonstração anterior ao cadastro fica para uma próxima etapa. Nenhuma funcionalidade principal foi retirada e nenhuma nova integração foi adicionada.

## Validação restante

Os testes automatizados cobrem domínio e interações em DOM simulado. Antes de afirmar que a experiência está pronta em todos os dispositivos, conferir em navegador e celular: temas, teclado virtual, zoom, toque, rolagem, leitores de tela e retorno do foco. A continuidade da consulta ao abrir e fechar um resultado de busca ainda pode melhorar: o retorno não conserva a consulta atual.

Para avaliar valor real, observar pessoas capturando uma pendência, encontrando a próxima ação, marcando um passo e reorganizando um dia interrompido. Registrar onde precisam de ajuda, se entendem o que foi salvo e se conseguem retomar após uma interrupção. Curva de aprendizado e adesão precisam dessa observação; quantidade de funcionalidades ou testes passando não mede esses resultados.
