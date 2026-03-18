// Minimal VS Code API mock for unit tests.
// Only the APIs used by extension.ts are mocked here.

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {},
  }),
  showWarningMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  registerWebviewViewProvider: () => ({ dispose: () => {} }),
};

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(undefined),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p }),
};
