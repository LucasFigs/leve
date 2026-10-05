import { useState } from 'react';
import { actions, useStore } from '../store/store';
import { useCloud } from '../store/sync';
import { Icon, type IconName } from '../components/Icon';

const SLIDES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'inbox', title: 'Capture tudo.', text: 'Escreva do seu jeito, em segundos. “Dentista quinta às 15”, “comprar ração”. Sem formulários.' },
  { icon: 'sparkles', title: 'Eu ajudo a organizar.', text: 'Sugiro quando fazer, quanto tempo leva e o que vem primeiro — sem lotar o seu dia.' },
  { icon: 'target', title: 'Foque na próxima ação.', text: 'Abra o app e veja só o que importa agora. Um toque e você começa.' },
];

export function Onboarding() {
  const settingsName = useStore((s) => s.settings.name);
  const cloudName = useCloud((c) => c.user?.preferredName);
  const existingName = settingsName || cloudName || '';
  const [i, setI] = useState(0);
  const [name, setName] = useState(existingName);
  const last = i === SLIDES.length;

  return (
    <main className="onboarding">
      <div className="row" style={{ justifyContent: 'flex-end', minHeight: 44 }}>
        {!last && (
          <button className="btn btn-ghost btn-sm" onClick={() => setI(SLIDES.length)}>
            Pular
          </button>
        )}
      </div>

      {!last ? (
        <div className="ob-slide" key={i}>
          <div className="ob-art">
            <Icon name={SLIDES[i].icon} size={40} stroke={1.6} />
          </div>
          <div className="ob-step num">{i + 1} de 3</div>
          <h1 className="ob-title">{SLIDES[i].title}</h1>
          <p className="ob-text">{SLIDES[i].text}</p>
        </div>
      ) : (
        <form
          className="ob-slide"
          key="name"
          onSubmit={(e) => {
            e.preventDefault();
            actions.finishOnboarding(name);
          }}
        >
          <div className="ob-art">
            <Icon name="leaf" size={40} stroke={1.6} />
          </div>
          <h1 className="ob-title">Tire tudo da cabeça.</h1>
          <p className="ob-text">Como posso te chamar?</p>
          <input className="input" style={{ marginTop: 16, fontSize: '1.125rem' }} placeholder="Seu nome (opcional)" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Seu nome" />
        </form>
      )}

      <div>
        {!last && (
          <div className="ob-dots" aria-hidden="true">
            {SLIDES.map((_, j) => (
              <i key={j} className={j === i ? 'on' : ''} />
            ))}
          </div>
        )}
        {!last ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => setI(i + 1)}>
            Continuar
            <Icon name="arrow-right" size={18} />
          </button>
        ) : (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => actions.finishOnboarding(name)}>
            Começar
          </button>
        )}
      </div>
    </main>
  );
}
