import { modules } from '../data/modules';
import type { ModuleId, ModuleProgress, ProgressState } from '../types';

export const progressStorageKey = 'netplus-lab-trainer-progress-v1';

export function createDefaultProgress(): ProgressState {
  const firstModule = modules[0].id;
  const moduleProgress = modules.reduce(
    (current, module) => ({
      ...current,
      [module.id]: {
        completed: false,
        bestScore: 0,
        attempts: 0,
        weakTags: [],
        lastScore: 0
      }
    }),
    {} as Record<ModuleId, ModuleProgress>
  );

  return {
    lastModuleId: firstModule,
    modules: moduleProgress
  };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> = window.localStorage): ProgressState {
  const defaults = createDefaultProgress();
  const raw = storage.getItem(progressStorageKey);

  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as {
      lastModuleId?: string;
      modules?: Partial<Record<string, ModuleProgress>>;
    };
    const parsedModules = parsed.modules ?? {};
    const legacyVlan = parsedModules.vlans;
    const legacyTrunking = parsedModules.trunking;
    const parsedSwitching = parsedModules.switching;
    const mergedSwitching = [defaults.modules.switching, parsedSwitching, legacyVlan, legacyTrunking].filter(Boolean) as ModuleProgress[];
    const restoredModules = Object.fromEntries(
      modules.map((module) => {
        const saved = parsedModules[module.id];
        return [module.id, { ...defaults.modules[module.id], ...saved }];
      })
    ) as Record<ModuleId, ModuleProgress>;

    if (mergedSwitching.length > 1) {
      restoredModules.switching = {
        completed: Boolean(parsedSwitching?.completed || (legacyVlan?.completed && legacyTrunking?.completed)),
        bestScore: Math.max(...mergedSwitching.map((module) => module.bestScore)),
        attempts: mergedSwitching.reduce((total, module) => total + module.attempts, 0),
        weakTags: [...new Set(mergedSwitching.flatMap((module) => module.weakTags))],
        lastScore: Math.max(...mergedSwitching.map((module) => module.lastScore))
      };
    }

    const parsedLastModuleId = parsed.lastModuleId;
    const lastModuleId =
      parsedLastModuleId === 'vlans' || parsedLastModuleId === 'trunking'
        ? 'switching'
        : parsedLastModuleId && parsedLastModuleId in defaults.modules
          ? parsedLastModuleId
          : defaults.lastModuleId;

    return {
      lastModuleId: lastModuleId as ModuleId,
      modules: restoredModules
    };
  } catch {
    return defaults;
  }
}

export function saveProgress(progress: ProgressState, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  storage.setItem(progressStorageKey, JSON.stringify(progress));
}

export function recordAttempt(
  progress: ProgressState,
  moduleId: ModuleId,
  score: number,
  total: number,
  weakTags: string[]
): ProgressState {
  const current = progress.modules[moduleId];
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);

  return {
    ...progress,
    lastModuleId: moduleId,
    modules: {
      ...progress.modules,
      [moduleId]: {
        completed: percent === 100 || current.completed,
        bestScore: Math.max(current.bestScore, percent),
        attempts: current.attempts + 1,
        weakTags,
        lastScore: percent
      }
    }
  };
}
