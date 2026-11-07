import type { Project } from '../domain/types';
import { getProjectIcon } from '../domain/projectIcons';
import { Icon } from './Icon';

/** O nome do projeto acompanha o símbolo nos consumidores; SVG é decorativo. */
export function ProjectIcon({ project, size = 20 }: { project: Pick<Project, 'emoji' | 'icon'>; size?: number }) {
  return <Icon name={getProjectIcon(project)} size={size} />;
}
