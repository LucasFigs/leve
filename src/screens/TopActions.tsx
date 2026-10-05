import { goTo, openSheet } from '../store/ui';
import { cloudEnabled } from '../store/sync';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';

export function TopActions({ children }: { children?: React.ReactNode }) {
  return (
    <div className="topbar-actions">
      {children}
      <button className="icon-btn" onClick={() => openSheet({ type: 'search' })} aria-label="Buscar">
        <Icon name="search" />
      </button>
      <button
        className="icon-btn mobile-only"
        onClick={() => (cloudEnabled ? openSheet({ type: 'account' }) : goTo('profile'))}
        aria-label="Conta e perfil"
      >
        <UserAvatar />
      </button>
    </div>
  );
}
