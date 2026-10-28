import { ABILITIES } from '../engine/engine/data/abilities';
import { RACES, UNITS } from '../engine/engine/data/races';
import type { GameEvent, HeroAbilityId, StatusId, UnitId } from '../models';

// All UI copy that isn't in the synced game data lives here (plan §15.4: one file, i18n later).

export const STATUS_NAMES: Record<StatusId, string> = {
  defending: 'Оборона',
  skip_next: 'Пропускає хід',
  blinded: 'Осліплений',
  entangled: 'Скутий корінням',
  maimed: 'Покалічений',
  diseased: 'Хворий',
  burning: 'Горить',
  war_drum: 'Бойовий барабан',
  rune_shield: 'Руна захисту',
  scream: 'Наляканий',
  heavenly_shield: 'Небесний щит',
  battle_cry: 'Бойовий клич',
};

export const END_REASONS: Record<string, string> = {
  elimination: 'усі вороги розбиті',
  'round-limit': 'ліміт раундів — перемога за балами',
  surrender: 'суперник здався',
  'not-enough-players': 'забракло гравців',
};

export const ELIMINATION_REASONS: Record<string, string> = {
  surrender: 'здався',
  timeout: 'пропустив три ходи поспіль',
  left: 'вийшов з гри',
  defeated: 'розбитий',
};

export const DAMAGE_DETAIL: Record<string, string> = {
  retaliation: 'відповідь',
  splash: 'сплеск',
  burn: 'вогонь',
  reflect: 'відбиття',
  lightning: 'розряд',
  hero: 'герой',
};

export function unitName(unitId: UnitId | string): string {
  return UNITS[unitId as UnitId]?.name ?? unitId;
}

export function abilityName(id: string | undefined): string {
  if (!id) return '';
  const unitAbility = ABILITIES[id as keyof typeof ABILITIES];
  if (unitAbility) return unitAbility.name;
  const race = Object.values(RACES).find((candidate) => candidate.hero.ability.id === (id as HeroAbilityId));
  return race?.hero.ability.name ?? id;
}

/** `[3, 9]` → `3–9`, `[2, 2]` → `2`. */
export function range([min, max]: readonly [number, number] | readonly number[]): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export interface EventNames {
  stack: (id: string | undefined) => string;
  seat: (seat: number | undefined) => string;
}

/** One line of the battle log, or null for events the log skips. */
export function eventLine(event: GameEvent, names: EventNames): string | null {
  const who = names.stack(event.stackId);
  const whom = names.stack(event.targetId);
  switch (event.type) {
    case 'battleStarted':
      return 'Бій почався';
    case 'roundStarted':
      return `Раунд ${event.round}`;
    case 'turnStarted':
      return `Хід: ${names.seat(event.seat)}`;
    case 'moved':
      return `${who} рушає`;
    case 'attacked':
      return `${who} атакує ${whom}`;
    case 'shot':
      return `${who} стріляє в ${whom}`;
    case 'damaged': {
      const detail = event.detail ? ` (${DAMAGE_DETAIL[event.detail] ?? event.detail})` : '';
      const kills = event.kills ? `, гине ${event.kills}` : '';
      return `${who}: −${event.amount} HP${kills}${detail}`;
    }
    case 'missed':
      return `${who} ухиляється`;
    case 'retaliated':
      return `${who} відповідає`;
    case 'abilityUsed':
      return `${who}: ${abilityName(event.abilityId)}${event.targetId ? ` → ${whom}` : ''}`;
    case 'heroAbility':
      return `Герой ${names.seat(event.seat)}: ${abilityName(event.abilityId)}${event.targetId ? ` → ${whom}` : ''}`;
    case 'healed':
      return `${who}: +${event.amount} HP`;
    case 'resurrected':
      return `${who} воскресає (+${event.amount} HP)`;
    case 'raised':
      return `${who}: +${event.amount} скелетів`;
    case 'statusApplied':
      return `${who}: ${STATUS_NAMES[event.statusId!] ?? event.statusId}`;
    case 'skipped':
      return `${who} пропускає хід`;
    case 'defended':
      return `${who} в обороні`;
    case 'stackDied':
      return `${who} загинув`;
    case 'morale':
      return event.detail === 'again' ? `${who}: мораль — ще одна дія!` : `${who}: мораль — пропуск`;
    case 'luck':
      return `${who}: ${event.detail === 'half' ? 'невдача' : 'удача'}!`;
    case 'wallBuilt':
      return `${names.seat(event.seat)}: кам'яна стіна`;
    case 'timedOut':
      return `${names.seat(event.seat)}: час вийшов`;
    case 'surrendered':
      return `${names.seat(event.seat)} здається`;
    case 'playerEliminated':
      return `${names.seat(event.seat)} вибуває — ${ELIMINATION_REASONS[event.reason ?? ''] ?? event.reason}`;
    case 'battleOver':
      return 'Бій закінчено';
    default:
      return null;
  }
}

/** Short floating text over a stack for an event, or null. */
export function floatText(event: GameEvent): string | null {
  switch (event.type) {
    case 'missed':
      return 'Ухилення';
    case 'abilityUsed':
      return abilityName(event.abilityId);
    case 'statusApplied':
      return STATUS_NAMES[event.statusId!] ?? null;
    case 'skipped':
      return 'Пропуск';
    case 'defended':
      return 'Оборона';
    case 'morale':
      return event.detail === 'again' ? 'Мораль!' : 'Розгубленість';
    case 'luck':
      return event.detail === 'half' ? 'Невдача' : event.detail === 'critical' ? 'Критичний!' : 'Удача!';
    default:
      return null;
  }
}

export const ERROR_REASONS: Record<string, string> = {
  // invalid-army
  'no-race': 'Спершу оберіть расу.',
  'no-stacks': 'Купіть хоча б один загін.',
  'too-many-stacks': 'Забагато загонів для цієї карти.',
  'unknown-unit': 'Невідомий юніт.',
  'wrong-race': 'Цей юніт з іншої раси.',
  'bad-count': 'Кількість має бути від 1.',
  'too-many-of-type': 'Не більше двох загонів одного типу.',
  'too-many-champions': 'Забагато чемпіонів для цього бюджету.',
  'unknown-item': 'Невідомий предмет.',
  'wrong-slot': 'Предмет не для цього слота.',
  'too-many-rings': 'Не більше двох кілець.',
  'gear-over-cap': 'Спорядження понад 30% бюджету.',
  'over-budget': 'Армія дорожча за бюджет.',
  'unbalanced-teams': 'Команди мають бути 2 на 2.',
  // invalid-deploy
  'missing-stack': 'Розставте всі загони.',
  'duplicate-stack': 'Загін поставлено двічі.',
  'outside-zone': 'Загін поза вашою зоною.',
  'cell-blocked': 'Клітинка зайнята перешкодою.',
  'cell-taken': 'Два загони на одній клітинці.',
};
