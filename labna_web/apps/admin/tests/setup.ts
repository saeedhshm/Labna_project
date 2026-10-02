import '@testing-library/jest-dom/vitest';

// The panel talks to the API through fetch; each test installs its own stub.
afterEach(() => {
  vi.unstubAllGlobals();
});
