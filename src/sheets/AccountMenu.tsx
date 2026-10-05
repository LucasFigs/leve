import { confirmSignOut, useCloud } from '../store/sync';
import { closeSheet, goTo } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Option } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';

/** Menu ao tocar no avatar: perfil, trocar de conta, sair. */
export function AccountMenuSheet() {
  const email = useCloud((c) => c.email);
  const user = useCloud((c) => c.user);
  const leave = async (switching: boolean) => {
    if (await confirmSignOut(switching)) closeSheet();
  };

  return (
    <BottomSheet title="Sua conta" onClose={closeSheet}>
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <UserAvatar size={48} />
        <div className="grow">
          <div className="truncate" style={{ fontWeight: 600 }}>{user?.fullName || user?.preferredName || 'Sua conta'}</div>
          <div className="xs faint truncate">
            {email}
            {user?.provider === 'google' ? ' · Google' : ''}
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <Option icon="settings" title="Perfil e preferências" sub="Seus dados, horários, almoço e aparência" onClick={() => { closeSheet(); goTo('profile'); }} />
        <Option icon="user" title="Trocar de conta" sub="Sai desta conta para entrar com outra" onClick={() => leave(true)} />
        <Option icon="logout" title="Sair da conta" tone="red" onClick={() => leave(false)} />
      </div>
    </BottomSheet>
  );
}
