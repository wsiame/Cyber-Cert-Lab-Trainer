import type { LabStep } from '../types';

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^port\s+/, '')
    .replace(/^vlan\s+/, '');

export function isCorrectAnswer(step: LabStep, value: string) {
  const accepted = [step.answer, ...(step.acceptedAnswers ?? [])];
  const normalizedValue = normalize(value);

  return accepted.some((answer) => normalize(answer) === normalizedValue);
}
