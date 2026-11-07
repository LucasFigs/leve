import type { Project } from './types';
import type { IconName } from '../components/Icon';

/** Emojis apenas para ler/escrever o campo legado, nunca para renderização. */
export const PROJECT_ICONS = [
  { value: 'folder', label: 'Pasta', legacy: '📁' },
  { value: 'briefcase', label: 'Trabalho', legacy: '💼' },
  { value: 'plane', label: 'Viagem', legacy: '✈️' },
  { value: 'home', label: 'Casa', legacy: '🏠' },
  { value: 'dumbbell', label: 'Exercício', legacy: '💪' },
  { value: 'book', label: 'Estudos', legacy: '📚' },
  { value: 'wallet', label: 'Finanças', legacy: '💰' },
  { value: 'target', label: 'Objetivos', legacy: '🎯' },
  { value: 'palette', label: 'Criatividade', legacy: '🎨' },
  { value: 'lightbulb', label: 'Ideias', legacy: '🧠' },
  { value: 'heart', label: 'Afeto', legacy: '❤️' },
  { value: 'leaf', label: 'Natureza', legacy: '🌱' },
] as const satisfies readonly { value: IconName; label: string; legacy: string }[];
export type ProjectIconName = typeof PROJECT_ICONS[number]['value'];
const plain = (value: string) => value.replace(/[\uFE0E\uFE0F]/g, '');
export function getProjectIcon(project: Pick<Project, 'emoji' | 'icon'>): ProjectIconName {
  const legacy = PROJECT_ICONS.find(item => plain(item.legacy) === plain(project.emoji));
  const semantic = PROJECT_ICONS.find(item => item.value === project.icon);
  // Versões antigas podem editar só emoji e preservar o campo extra: respeitar essa escolha.
  return legacy?.value ?? semantic?.value ?? 'folder';
}
export function projectIconPatch(value: ProjectIconName): Pick<Project, 'emoji' | 'icon'> {
  const item = PROJECT_ICONS.find(icon => icon.value === value)!;
  return { icon: item.value, emoji: item.legacy };
}
