import type { Category } from './types';

export interface CategoryMeta {
  id: Category;
  label: string;
  icon: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'trabalho', label: 'Trabalho', icon: '💼' },
  { id: 'pessoal', label: 'Pessoal', icon: '👤' },
  { id: 'estudos', label: 'Estudos', icon: '📚' },
  { id: 'saude', label: 'Saúde', icon: '🏥' },
  { id: 'casa', label: 'Casa', icon: '🏠' },
  { id: 'financas', label: 'Finanças', icon: '💰' },
];

export const CATEGORY_MAP: Record<Category, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<Category, CategoryMeta>;

