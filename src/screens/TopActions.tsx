import { openProfile, openSheet } from '../store/ui';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';

export function TopActions({ children, hideSearch = false }: { children?: React.ReactNode; hideSearch?: boolean }) {
  return (
    <div className="topbar-actions">
      {children}
      {!hideSearch && <button className="icon-btn" onClick={() => openSheet({ type: 'search' })} aria-label="Buscar">
        <Icon name="search" />
      </button>}
      <button
        className="icon-btn"
        onClick={openProfile}
        aria-label="Conta e perfil"
      >
        <UserAvatar />
      </button>
    </div>
  );
}

/** Criação específica de cada área, com a mesma apresentação no cabeçalho. */
export function HeaderCreate({label,onClick}:{label:string;onClick:()=>void}) {
  return <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}><Icon name="plus" size={20}/></button>;
}
