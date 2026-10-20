import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_TIERS, SESSION_PACKS, lapses, packOf, totalFor } from '@/lib/pricing';
import { normalisePhone } from '@/lib/roster';

describe('session packs', () => {
  it('sells exactly the four packs at the agreed prices', () => {
    expect(SESSION_PACKS.map((p) => [p.sessions, p.fee])).toEqual([
      [4, 100_000],
      [8, 175_000],
      [12, 250_000],
      [20, 350_000],
    ]);
  });

  it('labels the top pack 16–20 and credits twenty', () => {
    expect(packOf(20)?.label).toBe('16–20 sessions');
  });

  it('knows no other sizes', () => {
    for (const n of [0, 1, 5, 16, 21, NaN, -4]) expect(packOf(n)).toBeNull();
  });

  it('puts pack members on a tier that never falls due', () => {
    expect(MEMBERSHIP_TIERS.pack.fee).toBe(0);
    expect(lapses('pack')).toBe(false);
  });
});

describe('court prices', () => {
  it('charges 30k for an hour and 45k for an hour and a half', () => {
    expect(totalFor(60, false)).toBe(30_000);
    expect(totalFor(90, false)).toBe(45_000);
  });

  it('charges the same with a coach', () => {
    expect(totalFor(60, true)).toBe(30_000);
    expect(totalFor(90, true)).toBe(45_000);
  });
});

describe('normalisePhone', () => {
  const tony = '+255712345678';

  it.each([
    '0712345678',
    '0712 345 678',
    '0712-345-678',
    '712345678',
    '+255712345678',
    '+255 712 345 678',
    '255712345678',
    '00255712345678',
    '(0712) 345 678',
  ])('reads %s as the same member', (typed) => {
    expect(normalisePhone(typed)).toBe(tony);
  });

  it('accepts 06… numbers too', () => {
    expect(normalisePhone('0621000111')).toBe('+255621000111');
  });

  it('treats blank as "no number"', () => {
    expect(normalisePhone('   ')).toBe('');
  });

  it.each(['071234567', '07123456789', '0512345678', '+254712345678', 'abc', '2557123456'])(
    'rejects %s',
    (typed) => {
      expect(normalisePhone(typed)).toBeNull();
    },
  );
});
