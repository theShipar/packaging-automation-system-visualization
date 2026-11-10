import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const token = (name: string) => {
  const m = css.match(new RegExp(`--lf-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!m) throw new Error(`token ${name} missing`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('WCAG AA text contrast (4.5:1)', () => {
  const surfaces = ['canvas', 'app-bg', 'surface', 'surface-muted', 'surface-hover', 'selected-fill'];
  for (const ink of ['ink', 'ink-2', 'ink-3', 'ink-4', 'selected-strong', 'warning-ink', 'error-ink', 'good']) {
    it(`A11Y-${ink} on every surface`, () => {
      for (const bg of surfaces) expect(ratio(token(ink), token(bg)), `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('A11Y-tones: status inks on their own soft fills', () => {
    expect(ratio(token('good'), token('good-soft'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('warning-ink'), token('warning-soft'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('error-ink'), token('error-soft'))).toBeGreaterThanOrEqual(4.5);
  });
  it('A11Y-white text on filled buttons', () => {
    for (const bg of ['ink', 'selected-strong', 'error-ink']) expect(ratio('#ffffff', token(bg)), bg).toBeGreaterThanOrEqual(4.5);
  });
});
