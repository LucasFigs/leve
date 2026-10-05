import { useEffect, useState } from 'react';
import { formatDuration, pad } from '../domain/dates';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Icon } from '../components/Icon';
import { completeWithFeedback } from '../components/feedback';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Modo foco: só a próxima ação, um cronômetro e nada mais. */
export function FocusMode() {
  const focus = useStore((s) => s.focus);
  const task = useStore((s) => (s.focus ? s.tasks.find((t) => t.id === s.focus!.taskId) : undefined));
  const [, tick] = useState(0);

  useEffect(() => {
    if (!focus?.running) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [focus?.running]);

  useEffect(() => {
    if (focus && !task) actions.endFocus();
  }, [focus, task]);

  useEffect(() => {
    if (!focus || !task) return;
    const prev = document.title;
    return () => {
      document.title = prev;
    };
  }, [focus, task]);

  if (!focus || !task) return null;

  const elapsed = (focus.elapsedBefore + (focus.running ? Date.now() - focus.startedAt : 0)) / 1000;
  const targetSec = focus.target ? focus.target * 60 : undefined;
  const reachedTarget = targetSec !== undefined && elapsed >= targetSec;
  const display = targetSec && !reachedTarget ? targetSec - elapsed : elapsed;
  const base = targetSec ?? (task.duration ?? 30) * 60;
  const progress = Math.min(1, elapsed / base);
  document.title = `${fmt(display)} · ${task.title}`;

  const steps = task.subtasks;
  const currentIdx = steps.findIndex((s) => !s.done);
  const current = currentIdx >= 0 ? steps[currentIdx] : undefined;

  const R = 100;
  const C = 2 * Math.PI * R;

  const exit = (message?: (min: number) => string) => {
    const min = actions.endFocus();
    if (message) toast(message(min));
  };

  const finishTask = () => {
    actions.endFocus();
    completeWithFeedback(task.id, focus.date);
  };

  return (
    <div className="focus" role="dialog" aria-modal="true" aria-label={`Foco: ${task.title}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => exit((m) => (m > 0 ? `Foco encerrado · ${formatDuration(m)}` : 'Foco encerrado'))}>
          <Icon name="x" size={18} />
          Sair
        </button>
        <span className="eyebrow">{focus.target && !reachedTarget ? `Só ${focus.target} minutos` : 'Foco'}</span>
        <span style={{ width: 80 }} />
      </div>

      <div className="focus-center">
        <div className="focus-task">{current ? task.title : 'Agora'}</div>
        <div className="focus-step" key={current?.id ?? 'task'}>{current ? current.title : task.title}</div>
        {steps.length > 0 && (
          <>
            <div className="focus-steps" aria-hidden="true">
              {steps.map((s, i) => (
                <i key={s.id} className={s.done ? 'done' : i === currentIdx ? 'current' : ''} />
              ))}
            </div>
            <span className="xs faint">
              Passo {Math.min(currentIdx + 1 || steps.length, steps.length)} de {steps.length}
            </span>
          </>
        )}

        <div className={`timer${focus.running ? '' : ' paused'}`} role="timer" aria-live="off">
          <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
            <circle
              cx="110" cy="110" r={R} fill="none" stroke={reachedTarget ? 'var(--green)' : 'var(--accent)'} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="timer-value num">{fmt(display)}</div>
          <div className="timer-label">{focus.running ? (targetSec && !reachedTarget ? 'restantes' : 'em foco') : 'pausado'}</div>
        </div>

        {reachedTarget && focus.target ? (
          <div className="stack" style={{ alignItems: 'center', gap: 10 }}>
            <p style={{ fontWeight: 600 }}>{focus.target} minutos feitos. Começar era a parte difícil.</p>
            <div className="row">
              <button className="btn btn-soft" onClick={() => actions.extendFocus(15)}>Mais 15 min</button>
              <button className="btn btn-secondary" onClick={() => exit((m) => `Você avançou ${formatDuration(m)} em “${task.title}”`)}>
                Parar por aqui
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="focus-controls">
        <button
          className="btn btn-secondary btn-lg"
          style={{ width: 64, padding: 0 }}
          onClick={() => (focus.running ? actions.pauseFocus() : actions.resumeFocus())}
          aria-label={focus.running ? 'Pausar' : 'Continuar'}
        >
          <Icon name={focus.running ? 'pause' : 'play'} size={20} fill={!focus.running} stroke={focus.running ? 2.4 : 1.8} />
        </button>
        {current ? (
          <button className="btn btn-primary btn-lg grow" onClick={() => actions.toggleSubtask(task.id, current.id)}>
            <Icon name="check" size={18} />
            Concluir passo
          </button>
        ) : (
          <button className="btn btn-primary btn-lg grow" onClick={finishTask}>
            <Icon name="check" size={18} />
            Concluir tarefa
          </button>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 4 }}>
        {current && (
          <button className="btn btn-ghost btn-sm" onClick={finishTask}>
            Concluir tudo
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            actions.endFocus();
            openSheet({ type: 'replan', id: task.id, date: focus.date });
          }}
        >
          Não consegui terminar
        </button>
      </div>
    </div>
  );
}
