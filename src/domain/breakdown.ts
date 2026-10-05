/** Quebra de tarefas grandes em passos pequenos e concretos. */
import { normalize } from './parser';

const TEMPLATES: [RegExp, string[]][] = [
  [/\bapresentacao\b/, ['Abrir a apresentação', 'Criar a estrutura', 'Definir os tópicos', 'Fazer o primeiro slide', 'Completar os slides', 'Revisar e ensaiar']],
  [/\bviagem\b/, ['Pesquisar passagens', 'Definir hospedagem', 'Reservar hotel', 'Montar roteiro', 'Verificar documentos', 'Preparar a mala']],
  [/\brelatorio\b/, ['Abrir o documento', 'Reunir os dados', 'Esboçar a estrutura', 'Escrever a primeira seção', 'Completar e revisar', 'Enviar']],
  [/\bmudanca\b/, ['Fazer orçamento de transportadoras', 'Separar o que vai e o que fica', 'Comprar caixas', 'Embalar por cômodo', 'Transferir contas e endereço']],
  [/\b(festa|aniversario|churrasco)\b/, ['Definir data e local', 'Fazer a lista de convidados', 'Enviar os convites', 'Planejar comida e bebida', 'Comprar o que falta']],
  [/\bpresente\b/, ['Anotar 3 ideias', 'Definir um orçamento', 'Escolher e comprar', 'Embrulhar']],
  [/\b(imposto|declaracao|irpf)\b/, ['Reunir informes de rendimento', 'Separar recibos e comprovantes', 'Abrir o programa da Receita', 'Preencher a declaração', 'Revisar e enviar']],
  [/\bcurriculo\b/, ['Abrir a versão atual', 'Atualizar experiências recentes', 'Ajustar o resumo', 'Revisar formatação', 'Exportar em PDF']],
  [/\b(site|portfolio|landing)\b/, ['Definir o objetivo', 'Listar as páginas e seções', 'Escolher referências visuais', 'Montar a primeira página', 'Publicar']],
  [/\b(estudar|prova|curso|certificacao)\b/, ['Separar o material', 'Escolher o tópico de hoje', 'Estudar por 25 minutos', 'Fazer exercícios', 'Revisar o que aprendeu']],
  [/\b(proposta|artigo|escrever|tcc|monografia|texto)\b/, ['Abrir o documento', 'Listar os pontos principais', 'Escrever um rascunho rápido', 'Desenvolver cada seção', 'Revisar']],
  [/\b(planilha|orcamento)\b/, ['Abrir a planilha', 'Listar as categorias', 'Preencher os valores', 'Conferir os totais']],
  [/\b(organizar|arrumar|limpar|faxina)\b/, ['Escolher por onde começar', 'Separar o que sai', 'Organizar a primeira parte (15 min)', 'Terminar o restante']],
  [/\b(planejar|planejamento)\b/, ['Definir o objetivo', 'Listar as etapas', 'Estimar prazos', 'Marcar o primeiro passo na agenda']],
];

const GENERIC = [
  'Definir o primeiro passo concreto',
  'Separar o que você precisa',
  'Fazer a primeira parte (10 min)',
  'Continuar até um bom ponto de parada',
  'Revisar e concluir',
];

export function suggestBreakdown(title: string): string[] {
  const n = normalize(title);
  return (TEMPLATES.find(([re]) => re.test(n))?.[1] ?? GENERIC).slice();
}

/** O menor passo possível para começar agora. */
export function starterStep(title: string): string {
  return suggestBreakdown(title)[0];
}
