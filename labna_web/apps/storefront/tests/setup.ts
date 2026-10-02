import '@testing-library/jest-dom/vitest';

// The storefront reads catalog data through fetch; each test installs its own stub.
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});