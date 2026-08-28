import { resolveDavUrl } from '../resolve-url';

describe('resolveDavUrl', () => {
  it('resolves a relative URL against the origin', () => {
    expect(resolveDavUrl('/dav/', 'https://hitome.example:8443')).toBe(
      'https://hitome.example:8443/dav/'
    );
  });

  it('passes absolute URLs through untouched', () => {
    expect(
      resolveDavUrl('https://radicale.example:7000/', 'https://other.example')
    ).toBe('https://radicale.example:7000/');
  });

  it('leaves a relative URL as-is without an origin (static export / native)', () => {
    expect(resolveDavUrl('/dav/', null)).toBe('/dav/');
  });

  it('passes empty through (unconfigured native build)', () => {
    expect(resolveDavUrl('', null)).toBe('');
  });
});
