# Hábitos: primeira etapa

Escopo aprovado em 05/11/2026: reconhecer e executar hábitos no dia a dia, com personalização opcional e acompanhamento coerente com a programação.

## Experiência

- Hoje e demais listas mostram o rótulo Hábito, um ícone e um detalhe discreto de cor. A sugestão Agora também identifica hábitos. O check continua concluindo a ocorrência exibida com um toque.
- Na edição, Aparência do hábito oferece 11 ícones e seis cores com prévia. A seção fica recolhida por padrão. Automático/Automática restauram as escolhas inferidas pelo app.
- A aparência escolhida acompanha a lista, a sugestão, a linha do tempo e o calendário. A cor automática deixou de depender da posição do item na lista; mantém a inferência por categoria e identificador. A inferência de ícone reconhece palavras com acentos.
- Texto, símbolo e estado selecionado acompanham as cores; os botões de personalização e os controles principais dos cards de hábitos têm área de 44 px.
- O histórico detalhado continua na área de Hábitos, sem heatmaps adicionais no Hoje.

## Sequências

Contam ocorrências programadas consecutivas concluídas. Descansos entre os dias escolhidos e ocorrências puladas não interrompem a sequência. Hoje ainda pendente não rompe a sequência; uma ocorrência anterior pendente rompe. Registros fora da regra ou no futuro não aumentam a contagem. As frequências são descritas pelos dias/regras definidos, sem representar dias fixos como uma meta semanal flexível.

## Dados e compatibilidade

`habitColor` e `habitIcon` são campos opcionais com valores permitidos explícitos. Hábitos existentes continuam funcionando sem preencher nada. Os valores acompanham o registro JSON já sincronizado; não houve mudança de tabelas, permissões ou autorização. Edições preservam a escolha de alcance de uma série; uma ocorrência editada à parte mantém sua aparência e pode ser editada sem virar uma nova repetição.

O worker de push gerado foi atualizado para acompanhar a validação compartilhada. A personalização não altera os lembretes ou os escopos de acesso ao Google.

## Validação e publicação

118 testes passaram, incluindo sequências com fim de semana, dias alternados, frequência mensal, término da série, ocorrências puladas, dados inválidos, salvamento da aparência e conclusão/reabertura. Build TypeScript/Vite aprovado. Conferência visual no Edge headless em 390 px, temas claro/escuro, com dados fictícios e Supabase desativado; não substitui validação em aparelho físico.

Contagem, medidas e abandono de hábitos continuam fora desta etapa. As alterações são locais; frontend e worker não foram publicados por esta revisão.
