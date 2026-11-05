import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Acordeão nativo com o mesmo vocabulário visual dos demais controles. */
export function Disclosure({ title, children, icon, className = 'secondary-panel', defaultOpen }: {
  title: ReactNode;
  children: ReactNode;
  icon?: IconName;
  className?: string;
  defaultOpen?: boolean;
}) {
  return <details className={`disclosure ${className}`} open={defaultOpen || undefined}>
    <summary className="disclosure-trigger">
      {icon && <span className="disclosure-icon"><Icon name={icon} size={18} /></span>}
      <span className="disclosure-title">{title}</span>
      <span className="disclosure-chevron"><Icon name="chevron-down" size={16} /></span>
    </summary>
    <div className="disclosure-body">{children}</div>
  </details>;
}
