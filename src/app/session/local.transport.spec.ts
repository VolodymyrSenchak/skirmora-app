import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../core/rng';
import type { Rng } from '../engine/engine/rng';
import type { PocketLegionsView } from '../models';
import { PocketLegions } from './actions';
import { LOCAL_STORAGE_KEY, LocalTransport } from './local.transport';
import { autoDeployFor, presetArmy } from './local-presets';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

function newGame(nicknames: string[], storage: Storage | null = null, rng: Rng = createSeededRng(7)) {
  let clock = Date.parse('2026-11-01T12:00:00.000Z');
  const created = LocalTransport.create(
    { nicknames, settings: { mapId: 'arena', budget: 1000 } },
    { rng, storage, now: () => new Date((clock += 1000)) },
  );
  if (!('transport' in created)) throw new Error(created.error.message);
  return created.transport;
}

function game(transport: LocalTransport): PocketLegionsView {
  return transport.view().game!;
}

/** Every seat buys the preset army and deploys automatically, as the quick battle does. */
function playToBattle(transport: LocalTransport, races = ['knights', 'barbarians', 'elves'] as const) {
  while (game(transport).phase !== 'battle') {
    transport.confirmHandover();
    const view = game(transport);
    const seat = view.mySeat!;
    if (view.phase === 'army') {
      expect(transport.dispatchSync(PocketLegions.pickRace(races[seat])).ok).toBe(true);
      const army = presetArmy(races[seat], 1000, 10, view.seats.length);
      expect(transport.dispatchSync(PocketLegions.submitArmy(army)).ok).toBe(true);
    } else {
      expect(transport.dispatchSync(PocketLegions.submitDeploy(autoDeployFor(view))).ok).toBe(true);
    }
  }
}

/** One legal move from the hints, picked by `rng`: what a tap can send. */
function randomHintAction(view: PocketLegionsView, rng: Rng) {
  const hints = view.hints!;
  const stack = rng.pick(hints.stacks);
  const options = [
    ...stack.attacks.map((attack) => PocketLegions.act({ stackId: stack.stackId, kind: 'attack', target: attack.targetId, cell: rng.pick(attack.from) })),
    ...stack.shots.map((shot) => PocketLegions.act({ stackId: stack.stackId, kind: 'shoot', target: shot.targetId })),
    ...stack.moves.map((cell) => PocketLegions.act({ stackId: stack.stackId, kind: 'move', cell })),
  ];
  // prefer fighting, so the battle ends before the round limit most of the time
  const fights = options.slice(0, stack.attacks.length + stack.shots.length);
  if (fights.length && rng.int(4) > 0) return rng.pick(fights);
  return options.length ? rng.pick(options) : PocketLegions.act({ stackId: stack.stackId, kind: 'defend' });
}

describe('LocalTransport', () => {
  it('plays a full 2-seat battle from the hints alone', () => {
    const transport = newGame(['Іван', 'Олена']);
    playToBattle(transport);
    const rng = createSeededRng(42);
    let actions = 0;
    while (game(transport).phase === 'battle') {
      const view = game(transport);
      // the viewer is always the active seat, and only it gets hints
      expect(view.mySeat).toBe(view.battle!.activeSeat);
      expect(view.hints).not.toBeNull();
      const result = transport.dispatchSync(randomHintAction(view, rng));
      expect(result.ok, JSON.stringify(!result.ok && result.error)).toBe(true);
      actions++;
      expect(actions).toBeLessThan(3000);
    }
    const over = game(transport);
    expect(over.phase).toBe('over');
    expect(over.result?.winnerSeats.length).toBeGreaterThan(0);
  });

  it('raises the curtain before every private view change and never shows another army', () => {
    const transport = newGame(['Іван', 'Олена', 'Марко']);
    transport.connect();

    expect(transport.handover()?.nickname).toBe('Іван');
    for (const [seat, raceId] of (['knights', 'vampires', 'elves'] as const).entries()) {
      expect(transport.handover()?.seat).toBe(seat);
      transport.confirmHandover();
      expect(transport.handover()).toBeNull();
      const view = game(transport);
      expect(view.mySeat).toBe(seat);
      // nobody else's army is in this view
      expect(view.mine?.army).toBeNull();
      transport.dispatchSync(PocketLegions.pickRace(raceId));
      transport.dispatchSync(PocketLegions.submitArmy(presetArmy(raceId, 1000, 10, 3)));
    }
    expect(game(transport).phase).toBe('deploy');
    for (let seat = 0; seat < 3; seat++) {
      expect(transport.handover()?.seat).toBe(seat);
      transport.confirmHandover();
      const view = game(transport);
      expect(view.mine?.deployment).toBeNull();
      transport.dispatchSync(PocketLegions.submitDeploy(autoDeployFor(view)));
    }
    expect(game(transport).phase).toBe('battle');
    // the battle is public: no curtain, the active seat holds the phone
    expect(transport.handover()).toBeNull();
  });

  it('resumes from storage after a reload', () => {
    const storage = new MemoryStorage();
    const transport = newGame(['Іван', 'Олена'], storage);
    playToBattle(transport);
    const before = transport.view();
    expect(storage.getItem(LOCAL_STORAGE_KEY)).not.toBeNull();

    const restored = LocalTransport.restore({ storage, rng: createSeededRng(1) })!;
    expect(restored).not.toBeNull();
    const after = restored.view();
    expect(after.version).toBe(before.version);
    expect(after.me.playerId).toBe(before.me.playerId);
    expect(after.game!.battle).toEqual(before.game!.battle);

    const view = after.game!;
    const result = restored.dispatchSync(randomHintAction(view, createSeededRng(3)));
    expect(result.ok).toBe(true);
  });

  it('rejects a move the hints did not offer, and lobby actions', () => {
    const transport = newGame(['Іван', 'Олена']);
    playToBattle(transport);
    const view = game(transport);
    const enemy = view.battle!.stacks.find((stack) => stack.seat !== view.mySeat)!;
    const result = transport.dispatchSync(PocketLegions.act({ stackId: enemy.id, kind: 'defend' }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('illegal-action');
    expect(transport.dispatchSync({ type: 'lobby.start', payload: {} }).ok).toBe(false);
  });

  it('refuses a start the map does not allow', () => {
    const created = LocalTransport.create({ nicknames: ['A', 'B', 'C'], settings: { mapId: 'river' } }, { storage: null });
    expect('error' in created).toBe(true);
  });
});
