import { greetingForHour } from '../greeting';

describe('greetingForHour', () => {
  it.each([
    [0, 'Good night'],
    [4, 'Good night'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });

  it('falls back safely for an out-of-range or unknown hour', () => {
    expect(greetingForHour(-1)).toBe('Hello');
    expect(greetingForHour(24)).toBe('Hello');
    expect(greetingForHour(Number.NaN)).toBe('Hello');
  });
});
