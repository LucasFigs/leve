import { describe, expect, it } from 'vitest';
import { parse } from './parser';

// Sexta-feira, 2 de outubro de 2026
const ref = '2026-10-02';
const p = (s: string) => parse(s, { ref });

describe('parser', () => {
  it('captura simples com período', () => {
    const r = p('preciso marcar dentista semana que vem');
    expect(r.title).toBe('Marcar dentista');
    expect(r.kind).toBe('task');
    expect(r.period).toBe('week');
    expect(r.date).toBe('2026-10-05');
    expect(r.category).toBe('saude');
  });

  it('compromisso com pessoa e horário', () => {
    const r = p('quinta tenho reunião com o João às 15');
    expect(r.title).toBe('Reunião com o João');
    expect(r.kind).toBe('event');
    expect(r.date).toBe('2026-10-08');
    expect(r.time).toBe('15:00');
  });

  it('dia da semana no fim', () => {
    const r = p('comprar presente para minha mãe sábado');
    expect(r.title).toBe('Comprar presente para minha mãe');
    expect(r.date).toBe('2026-10-03');
  });

  it('tarefa grande', () => {
    const r = p('preciso terminar apresentação do projeto');
    expect(r.title).toBe('Terminar apresentação do projeto');
    expect(r.big).toBe(true);
  });

  it('duração explícita não vira horário', () => {
    const r = p('estudar Power Apps por 1h30 amanhã às 9h');
    expect(r.title).toBe('Estudar Power Apps');
    expect(r.duration).toBe(90);
    expect(r.time).toBe('09:00');
    expect(r.date).toBe('2026-10-03');
  });

  it('recorrência mensal', () => {
    const r = p('pagar conta de luz todo dia 10');
    expect(r.title).toBe('Pagar conta de luz');
    expect(r.recurrence).toMatchObject({ freq: 'monthly', monthDay: 10 });
  });

  it('hábito semanal', () => {
    const r = p('academia segunda/quarta/sexta às 7h');
    expect(r.kind).toBe('habit');
    expect(r.recurrence?.weekdays).toEqual([1, 3, 5]);
    expect(r.time).toBe('07:00');
  });

  it('intervalo', () => {
    const r = p('limpar apartamento a cada 15 dias');
    expect(r.recurrence).toMatchObject({ freq: 'interval', interval: 15 });
    expect(r.title).toBe('Limpar apartamento');
  });

  it('prioridade e prazo', () => {
    const r = p('enviar relatório até sexta urgente');
    expect(r.title).toBe('Enviar relatório');
    expect(r.priority).toBe('essential');
    expect(r.due).toBe('2026-10-09');
  });

  it('tarde', () => {
    expect(p('ligar pro banco amanhã às 3 da tarde').time).toBe('15:00');
    expect(p('café com Ana às 4').time).toBe('16:00');
  });

  it('data numérica', () => {
    expect(p('renovar documento 15/11').date).toBe('2026-11-15');
    expect(p('aniversário da Bia dia 20 de dezembro').date).toBe('2026-12-20');
  });
});
