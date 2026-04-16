// Stub modules for @tauri-apps/* packages — these are not installed in the
// web (server) frontend. All APIs are no-ops; vi.mock() in setup.ts will
// replace them at runtime, but Vite must still resolve the import path.

export const invoke = () => Promise.resolve(null);
export const listen = () => Promise.resolve(() => {});
export const emit = () => Promise.resolve();

// @tauri-apps/api/window
export const getCurrentWindow = () => ({
  onCloseRequested: () => Promise.resolve(() => {}),
  close: () => Promise.resolve(),
});

// @tauri-apps/plugin-shell
export const Command = {
  create: () => ({}),
};

// @tauri-apps/plugin-dialog
export const open = () => Promise.resolve(null);
export const save = () => Promise.resolve(null);
export const message = () => Promise.resolve();
export const ask = () => Promise.resolve(false);
export const confirm = () => Promise.resolve(false);

// @tauri-apps/plugin-fs
export const readTextFile = () => Promise.resolve('');
export const writeTextFile = () => Promise.resolve();
export const exists = () => Promise.resolve(false);
