import type { Category } from './types';
import type { IconName } from '../components/Icon';

export interface CategoryMeta {
  id: Category;
  label: string;
  icon: IconName;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'trabalho', label: 'Trabalho', icon: 'briefcase' },
  { id: 'pessoal', label: 'Pessoal', icon: 'user' },
  { id: 'estudos', label: 'Estudos', icon: 'book' },
  { id: 'saude', label: 'Saúde', icon: 'heart-pulse' },
  { id: 'casa', label: 'Casa', icon: 'home' },
  { id: 'financas', label: 'Finanças', icon: 'wallet' },
];

export const CATEGORY_MAP: Record<Category, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<Category, CategoryMeta>;

