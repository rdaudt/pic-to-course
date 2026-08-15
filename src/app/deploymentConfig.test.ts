import { describe, expect, it } from 'vitest';
import { PWA_BASE_PATH, PWA_SCOPE, PWA_START_URL } from './deploymentConfig';

describe('Vercel deployment configuration', () => {
  it('serves and installs the PWA from the domain root', () => {
    expect(PWA_BASE_PATH).toBe('/');
    expect(PWA_START_URL).toBe('/');
    expect(PWA_SCOPE).toBe('/');
  });
});
