import { describe, expect, it } from 'vitest';
import { createDefaultProgress, loadProgress, progressStorageKey, recordAttempt, saveProgress } from './progress';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe('progress', () => {
  it('records attempts and marks a perfect module complete', () => {
    const progress = createDefaultProgress();
    const updated = recordAttempt(progress, 'subnetting', 4, 4, []);

    expect(updated.lastModuleId).toBe('subnetting');
    expect(updated.modules.subnetting.completed).toBe(true);
    expect(updated.modules.subnetting.bestScore).toBe(100);
    expect(updated.modules.subnetting.attempts).toBe(1);
  });

  it('saves and loads local progress', () => {
    const storage = createMemoryStorage();
    const progress = recordAttempt(createDefaultProgress(), 'ports', 3, 4, ['ports']);

    saveProgress(progress, storage);

    expect(storage.getItem(progressStorageKey)).toContain('"ports"');
    expect(loadProgress(storage).modules.ports.lastScore).toBe(75);
  });

  it('merges old VLAN and trunking progress into switching', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      progressStorageKey,
      JSON.stringify({
        lastModuleId: 'trunking',
        modules: {
          vlans: { completed: true, bestScore: 80, attempts: 2, weakTags: ['VLANs'], lastScore: 70 },
          trunking: { completed: true, bestScore: 90, attempts: 3, weakTags: ['native VLAN'], lastScore: 90 }
        }
      })
    );

    const loaded = loadProgress(storage);

    expect(loaded.lastModuleId).toBe('switching');
    expect(loaded.modules.switching.completed).toBe(true);
    expect(loaded.modules.switching.bestScore).toBe(90);
    expect(loaded.modules.switching.attempts).toBe(5);
    expect(loaded.modules.switching.weakTags).toEqual(['VLANs', 'native VLAN']);
  });
});
