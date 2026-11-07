import { useEffect, useRef, useState } from 'react';
import { formatDuration, pad } from '../domain/dates';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Icon, type IconName } from '../components/Icon';
import { Checkbox } from '../components/ui';
import { completeWithFeedback } from '../components/feedback';
import { useModalFocus } from '../hooks/modalFocus';
import { Disclosure } from '../components/Disclosure';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  return `${pad(m)}:${pad(remainder)}`;
};

type PomodoroPhase = 'pomodoro' | 'shortBreak' | 'longBreak';

const PHASE_CONFIG: Record<PomodoroPhase, { label: string; icon: IconName; defaultMinutes: number }> = {
  pomodoro: { label: 'Foco', icon: 'target', defaultMinutes: 25 },
  shortBreak: { label: 'Pausa', icon: 'coffee', defaultMinutes: 5 },
  longBreak: { label: 'Pausa Longa', icon: 'moon', defaultMinutes: 15 },
};

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Audio Context not allowed or unsupported
  }
}

/** Execução livre, com Pomodoro e passos disponíveis sob demanda. */
export function FocusMode() {
  const focus = useStore((s) => s.focus);
  const task = useStore((s) => (s.focus ? s.tasks.find((t) => t.id === s.focus!.taskId) : undefined));
  const [, tick] = useState(0);

  const [phase, setPhase] = useState<PomodoroPhase>('pomodoro');
  const [timed, setTimed] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, !!focus && !!task);
  const [cycle, setCycle] = useState(1);
  const [phaseMinutes, setPhaseMinutes] = useState<number>(25);
  const [newStep, setNewStep] = useState('');
  const phaseStartRef = useRef<{ startedAt: number; elapsedBefore: number }>({ startedAt: Date.now(), elapsedBefore: 0 });
  const completedAlertRef = useRef<boolean>(false);
  const phaseTaskRef = useRef<string>();

  // Inicializa a fase com o target se houver (ex.: "Só 10 min")
  useEffect(() => {
    phaseTaskRef.current = focus?.taskId;
    setTimed(!!focus?.target);
    setPhase('pomodoro');
    setCycle(1);
    if (focus?.target) {
      setPhaseMinutes(focus.target);
    } else {
      setPhaseMinutes(PHASE_CONFIG.pomodoro.defaultMinutes);
    }
    phaseStartRef.current = { startedAt: focus?.startedAt ?? Date.now(), elapsedBefore: (focus?.elapsedBefore ?? 0) / 1000 };
    completedAlertRef.current = false;
  }, [focus?.taskId, focus?.target]);

  useEffect(() => {
    if (!focus?.running) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [focus?.running]);

  useEffect(() => {
    if (focus && !task) actions.endFocus();
  }, [focus, task]);

  // Cálculo do tempo decorrido na fase Pomodoro atual
  const running = !!focus?.running;
  const now = Date.now();
  const currentElapsed = timed
    ? phaseStartRef.current.elapsedBefore + (running ? (now - phaseStartRef.current.startedAt) / 1000 : 0)
    : focus ? (focus.elapsedBefore + (running ? now - focus.startedAt : 0)) / 1000 : 0;
  const targetSec = phaseMinutes * 60;
  const remainingSec = Math.max(0, targetSec - currentElapsed);
  const isFinished = timed && !!focus && phaseTaskRef.current === focus.taskId && remainingSec <= 0;
  const progress = timed ? Math.min(1, currentElapsed / targetSec) : 0;

  // Alerta de término da fase Pomodoro
  useEffect(() => {
  if (isFinished && !completedAlertRef.current) {
    completedAlertRef.current = true;
    playChime();
    if (phase === 'pomodoro') {
      setCycle(c => c + 1);
      toast('Bloco de foco concluído. Hora de descansar 5 minutos.');
    } else {
      toast('Pausa concluída! Pronto para o próximo foco?');
    }
  }
  }, [isFinished, phase]);

  useEffect(() => {
    if (!focus || !task) return;
    const oldTitle = document.title;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.title = oldTitle; document.body.style.overflow = oldOverflow; };
  }, [focus?.taskId, !!task]);
  useEffect(() => {
    if (focus && task) document.title = `${fmt(timed ? remainingSec : currentElapsed)} · ${task.title}`;
  }, [!!focus, task?.title, timed, remainingSec, currentElapsed]);

  if (!focus || !task) return null;

  const switchPhase = (nextPhase: PomodoroPhase) => {
    setTimed(true);
    setPhase(nextPhase);
    const mins = PHASE_CONFIG[nextPhase].defaultMinutes;
    setPhaseMinutes(mins);
    phaseStartRef.current = { startedAt: Date.now(), elapsedBefore: 0 };
    completedAlertRef.current = false;
    if (!focus.running) actions.resumeFocus();
  };

  const addTime = (mins: number) => {
    setPhaseMinutes((m) => m + mins);
    completedAlertRef.current = false;
  };

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

  const steps = task.subtasks;
  const completedSteps = steps.filter((s) => s.done).length;
  const currentIdx = steps.findIndex((s) => !s.done);
  const currentStep = currentIdx >= 0 ? steps[currentIdx] : undefined;

  const handleAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStep.trim()) return;
    actions.addSubtasks(task.id, [newStep.trim()]);
    setNewStep('');
  };

  return (
    <div ref={modalRef} tabIndex={-1} className="focus" role="dialog" aria-modal="true" aria-label={`Foco: ${task.title}`}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); exit(); } }}>
      <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
        <button className="btn btn-ghost" onClick={() => exit((m) => (m > 0 ? `Foco encerrado · ${formatDuration(m)}` : 'Foco encerrado'))}>
          <Icon name="x" size={18} />
          Sair
        </button>
        <span className="eyebrow focus-phase-label">
          {timed && <Icon name={PHASE_CONFIG[phase].icon} size={14} />}
          {!timed ? 'Em foco · no seu ritmo' : phase === 'pomodoro' ? `Pomodoro #${cycle}` : phase === 'shortBreak' ? 'Pausa curta' : 'Pausa longa'}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            actions.endFocus();
            openSheet({ type: 'replan', id: task.id, date: focus.date });
          }}
          title="Replanejar ou adiar"
        >
          Replanejar
        </button>
      </div>

      <div className="focus-center">
        {/* Seletor de fases Pomodoro */}
        <Disclosure className="focus-options" icon="clock" title={timed ? 'Opções de tempo' : 'Usar Pomodoro (opcional)'}>
        <div className="focus-pomo-tabs" role="group" aria-label="Duração do bloco">
          <button
            className={`focus-pomo-tab${phase === 'pomodoro' ? ' active' : ''}`}
            aria-pressed={timed && phase === 'pomodoro'}
            onClick={() => switchPhase('pomodoro')}
          >
            <Icon name={PHASE_CONFIG.pomodoro.icon} size={14} /> Foco (25m)
          </button>
          <button
            className={`focus-pomo-tab${phase === 'shortBreak' ? ' active' : ''}`}
            aria-pressed={timed && phase === 'shortBreak'}
            onClick={() => switchPhase('shortBreak')}
          >
            <Icon name={PHASE_CONFIG.shortBreak.icon} size={14} /> Pausa (5m)
          </button>
          <button
            className={`focus-pomo-tab${phase === 'longBreak' ? ' active' : ''}`}
            aria-pressed={timed && phase === 'longBreak'}
            onClick={() => switchPhase('longBreak')}
          >
            <Icon name={PHASE_CONFIG.longBreak.icon} size={14} /> Longa (15m)
          </button>
        </div>
        {timed && <button className="btn btn-ghost btn-sm" onClick={() => setTimed(false)}>Continuar sem contagem regressiva</button>}
        </Disclosure>

        <div className="focus-task" style={{ marginTop: 4 }}>{task.title}</div>
        {currentStep && (
          <div className="focus-step" key={currentStep.id}>
            {currentStep.title}
          </div>
        )}

        {/* Cronômetro circular do Pomodoro */}
        <div className={`timer${running ? '' : ' paused'}`} role="timer" aria-live="off">
          <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
            <circle
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke={isFinished ? 'var(--green)' : phase === 'pomodoro' ? 'var(--accent)' : 'var(--blue)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="timer-value num">{fmt(timed ? remainingSec : currentElapsed)}</div>
          <div className="timer-label">
            {!running ? 'pausado' : !timed ? 'de dedicação' : isFinished ? 'tempo concluído' : phase === 'pomodoro' ? 'restantes' : 'pausa'}
          </div>
        </div>

        {/* Notificação de fim de ciclo / extensões */}
        {isFinished ? (
          <div className="stack" style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <p style={{ fontWeight: 600 }}>
              {phase === 'pomodoro' ? 'Bloco de foco concluído! Descanse agora.' : 'Pausa encerrada! Pronto para focar?'}
            </p>
            <div className="row" style={{ gap: 8 }}>
              {phase === 'pomodoro' ? (
                <>
                  <button className="btn btn-primary" onClick={() => switchPhase('shortBreak')}>
                    Iniciar pausa (5 min)
                  </button>
                  <button className="btn btn-soft" onClick={() => addTime(5)}>
                    +5 min foco
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => switchPhase('pomodoro')}>
                  Próximo foco (25 min)
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Checklist de subtarefas / subáreas */}
        <Disclosure className="focus-checklist" icon="list" title="Passos da tarefa (opcional)" defaultOpen={steps.length > 0}>
          <div className="focus-checklist-head">
            <span>Checklist de passos</span>
            <span className="num">
              {completedSteps} de {steps.length} concluídos
            </span>
          </div>

          <div className="focus-checklist-items">
            {steps.map((s) => (
              <div key={s.id} className="focus-subtask-row">
                <Checkbox
                  checked={s.done}
                  onToggle={() => actions.toggleSubtask(task.id, s.id)}
                  label={`Marcar passo: ${s.title}`}
                />
                <span
                  className={`focus-subtask-text${s.done ? ' done' : ''}`}
                  onClick={() => actions.toggleSubtask(task.id, s.id)}
                >
                  {s.title}
                </span>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="xs faint" style={{ padding: '8px 0', textAlign: 'center' }}>
                Nenhum passo adicionado ainda. Adicione abaixo para acompanhar seu progresso!
              </p>
            )}
          </div>

          <form className="focus-add-subtask" onSubmit={handleAddStep}>
            <Icon name="plus" size={16} className="faint" />
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Adicionar novo passo..."
              aria-label="Adicionar novo passo"
            />
            {newStep.trim() && (
              <button type="submit" className="btn btn-sm btn-soft">
                Adicionar
              </button>
            )}
          </form>
        </Disclosure>
      </div>

      {/* Controles de ação principal */}
      <div className="focus-controls">
        <button
          className="btn btn-secondary btn-lg"
          style={{ width: 64, padding: 0 }}
          onClick={() => {
            if (running) {
              phaseStartRef.current = {
                startedAt: Date.now(),
                elapsedBefore: currentElapsed,
              };
              actions.pauseFocus();
            } else {
              phaseStartRef.current = {
                startedAt: Date.now(),
                elapsedBefore: currentElapsed,
              };
              actions.resumeFocus();
            }
          }}
          aria-label={running ? 'Pausar' : 'Continuar'}
        >
          <Icon name={running ? 'pause' : 'play'} size={20} fill={!running} stroke={running ? 2.4 : 1.8} />
        </button>

        {currentStep ? (
          <button className="btn btn-secondary btn-lg" onClick={() => actions.toggleSubtask(task.id, currentStep.id)}>
            <Icon name="check" size={18} />
            Passo feito
          </button>
        ) : null}

        <button className="btn btn-primary btn-lg grow" onClick={finishTask}>
          <Icon name="check" size={18} />
          Concluir tarefa
        </button>
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 8 }}>
        {timed && <button className="btn btn-ghost btn-sm" onClick={() => addTime(5)}>
          +5 min
        </button>}
        <button className="btn btn-ghost btn-sm" onClick={() => exit((m) => `Você avançou ${formatDuration(m)} em “${task.title}”`)}>
          Encerrar foco
        </button>
      </div>
    </div>
  );
}
