import { describe, expect, it } from 'vitest';
import { modules } from './modules';

describe('modules', () => {
  it('contains the planned starter topics', () => {
    expect(modules.map((module) => module.id)).toEqual([
      'subnetting',
      'switching',
      'ports',
      'services',
      'security',
      'wireless',
      'troubleshooting',
      'exam',
      'sec_cybersecurity',
      'sec_general',
      'sec_threats',
      'sec_architecture',
      'sec_operations',
      'sec_governance',
      'sec_exam',
      'google_foundations',
      'google_risk',
      'google_networks',
      'google_linux_sql',
      'google_assets',
      'google_detection',
      'google_incident',
      'google_policies',
      'google_exam'
    ]);
  });

  it('has complete guided lab content', () => {
    const categoryModules = modules.filter((module) => module.id !== 'exam' && module.id !== 'sec_exam' && module.id !== 'google_exam');
    const networkPlusModules = modules.filter((module) => module.certification === 'Network+' && module.id !== 'exam');
    const securityPlusModules = modules.filter((module) => module.certification === 'Security+' && module.id !== 'sec_exam');
    const googleModules = modules.filter((module) => module.certification === 'Google Cyber' && module.id !== 'google_exam');
    const examModule = modules.find((module) => module.id === 'exam');
    const securityExamModule = modules.find((module) => module.id === 'sec_exam');
    const googleExamModule = modules.find((module) => module.id === 'google_exam');

    for (const module of modules) {
      expect(module.lesson.length).toBeGreaterThan(0);
      expect(module.steps.length).toBeGreaterThanOrEqual(
        module.id === 'exam' ? 200 : module.id === 'sec_exam' ? 130 : module.id === 'google_exam' ? 160 : 20
      );

      for (const step of module.steps) {
        expect(step.prompt).toBeTruthy();
        expect(step.answer).toBeTruthy();
        expect(step.choices).toHaveLength(4);
        expect(step.choices).toContain(step.answer);
        expect(step.explanation).toBeTruthy();
        expect(step.visual?.title).toBeTruthy();
        expect(step.visual?.labels.length).toBeGreaterThan(0);
      }
    }

    expect(examModule?.steps.length).toBe(networkPlusModules.reduce((total, module) => total + module.steps.length, 0));
    expect(securityExamModule?.steps.length).toBe(securityPlusModules.reduce((total, module) => total + module.steps.length, 0));
    expect(googleExamModule?.steps.length).toBe(googleModules.reduce((total, module) => total + module.steps.length, 0));
    expect(categoryModules.length).toBe(21);
  });

  it('combines VLAN and trunking practice into switching', () => {
    const switching = modules.find((module) => module.id === 'switching');

    expect(switching?.steps.some((step) => step.id.startsWith('vlan-'))).toBe(true);
    expect(switching?.steps.some((step) => step.id.startsWith('trunk-'))).toBe(true);
  });

  it('does not put every correct answer in the first choice position', () => {
    const steps = modules.flatMap((module) => module.steps);
    const firstChoiceCorrectCount = steps.filter((step) => step.choices[0] === step.answer).length;

    expect(firstChoiceCorrectCount).toBeGreaterThan(0);
    expect(firstChoiceCorrectCount).toBeLessThan(steps.length * 0.45);
  });

  it('does not include obvious filler distractors in rendered choices', () => {
    const fillerPatterns = [
      /monitor brightness/i,
      /keyboard layout/i,
      /mouse speed/i,
      /browser history/i,
      /printer ink/i,
      /office chairs/i,
      /snacks/i,
      /wallpaper/i,
      /desk height/i,
      /shipping labels/i,
      /the monitor is off/i,
      /screen brightness/i,
      /wrong web browser/i
    ];

    const choices = modules.flatMap((module) => module.steps.flatMap((step) => step.choices));

    for (const choice of choices) {
      expect(fillerPatterns.some((pattern) => pattern.test(choice))).toBe(false);
    }
  });
});
