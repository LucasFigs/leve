import { useState } from 'react';
import { useStore } from '../store/store';
import { useCloud } from '../store/sync';
import { Icon } from './Icon';

/** Foto da conta (Google) ou a inicial do nome. */
export function UserAvatar({ size = 32 }: { size?: number }) {
  const photo = useCloud((c) => c.user?.avatarUrl);
  const cloudName = useCloud((c) => c.user?.fullName || c.email);
  const name = useStore((s) => s.settings.name) || cloudName;
  const [broken, setBroken] = useState(false);

  if (photo && !broken) {
    return (
      <img
        className="avatar"
        src={photo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover' }}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {name ? name.charAt(0).toUpperCase() : <Icon name="user" size={size * 0.5} />}
    </span>
  );
}
