# Jornada essencial do Leve

O núcleo permanece **capturar → decidir → começar → ajustar**. Esta rodada prioriza confiança nos dados, não novas ferramentas de organização.

| Momento | Problema / hipótese | Menor intervenção implementada | Como validar com pessoas |
| --- | --- | --- | --- |
| Capturar | Texto longo parecia salvo, mas podia invalidar a persistência | Limite explicado, texto preservado, sem cortar nem abrir campos obrigatórios. Descartar duração/horário agora afeta os campos corretos | Colar uma anotação longa, ajustar e confirmar; pedir que expliquem se já está salva |
| Salvar / voltar ao app | Quota e conflitos eram silenciosos | Gravação sem debounce; aviso persistente só em falha, exportação e retry. Em conflito, preservar versões antes de recarregar | Simular falha, verificar se a pessoa entende o risco de fechar e encontra a exportação |
| Sair / trocar conta | Mensagem prometia nuvem sem confirmar envio | Tentar sincronizar, manter estado se falhar e pedir escolha explícita antes de descartar | Usar backend mockado 503/offline; observar se Cancelar/Retry são compreendidos |
| Planejar semana | Dia sem disponibilidade ainda recebia tarefas | Orçamento zero e nenhuma atribuição forçada; mantém sem data o que não cabe | Jornada com almoço ocupando toda a janela e tarefa longa; conferir se a pessoa encontra o item sem data |
| Integrar calendário | Troca de destino podia usar vínculo anterior incorretamente | “Destino de novos itens”; itens vinculados permanecem no original | Duas agendas fictícias, explicar o efeito da seleção antes de confirmar |
| Abrir lembrete | Cold start perdia a tarefa durante login | Intenção mantida até sessão/dados confirmados; aviso para conta diferente | Abrir push mockado, autenticar e verificar a ocorrência; repetir com outra conta |
| Privacidade do lembrete | Título podia aparecer na tela bloqueada | Opção discreta sob Lembretes, sem mudar o padrão existente | Comparar avisos fictícios com opção ligada/desligada em aparelho real |

Mantidos: Inbox como destino neutro, uma frase para capturar, execução em um toque, passos e Pomodoro opcionais, comparação semanal e Semana recolhida, detalhes progressivos, tarefas/compromissos/hábitos/projetos, desfazer e escolha de alcance da recorrência. Nenhum chatbot, analytics, gamificação ou biblioteca pesada foi adicionado.

O teste demonstrativo antes do login continua uma proposta separada: exige namespace de dados fictícios, migração explícita e isolamento por conta antes de qualquer implementação. Também ficam como propostas: spans do parser para reconstruir títulos após rejeitar só uma interpretação e importação guiada das versões de recuperação, com validação e comprovação de conta de origem.

Testes automatizados e Edge headless apoiam a correção técnica. Não medem adesão, produtividade, aprendizado ou benefícios clínicos. Entrevistas e observação do fluxo em celulares reais permanecem pendentes.
