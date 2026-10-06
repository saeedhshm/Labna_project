import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

// Makes `expect(container).toHaveNoViolations()` available to every test.
expect.extend(toHaveNoViolations);

// The storefront reads catalog data through fetch; each test installs its own stub.
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
