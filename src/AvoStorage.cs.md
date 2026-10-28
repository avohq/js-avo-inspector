# AvoStorage

## Short description

Key-value persistence used by both Inspector builds (full and lite) for the batch queue and stream-id state. Backed by `window.localStorage` under suffix-namespaced keys, with an in-memory map as fallback when localStorage is unavailable.

## Tech stack

- TypeScript, browser runtime: `window.localStorage`, `JSON`.
- Reads the bundler-defined `process.env.BROWSER` in the synchronous getter.

## Data

```ts
class AvoStorage {
  Platform: string | null;          // always "browser"
  storageImpl: PlatformAvoStorage;  // always a BrowserAvoStorage
  constructor(shouldLog: boolean | (() => boolean), suffix: string = "")
  isInitialized(): boolean
  getItemAsync<T>(key: string): Promise<T | null>
  getItem<T>(key: string): T | null
  setItem<T>(key: string, value: T): void
  removeItem(key: string): void
  runAfterInit(func: () => void): void
}
```

- `PlatformAvoStorage` (internal, abstract): the same operations plus `init(shouldLog, suffix)`; shared `parseJson` maps `null`/`undefined` → `null`, anything else → `JSON.parse`.
- `BrowserAvoStorage` state: `useFallbackStorage`, `fallbackStorage: Record<string, string | null>`, `storageInitialized`, `onStorageInitFuncs`, `shouldLog`, `suffix`.

## Users and permissions

Constructed by `AvoInspector` / `AvoInspectorLite` and held on their static `avoStorage`; read and written by the batchers and `AvoStreamId`. No auth.

## Functional requirements

- **Constructor:** creates a `BrowserAvoStorage` and initialises it synchronously: normalises `shouldLog` (a boolean or a `() => boolean` getter) to a getter and stores it with `suffix`; probes localStorage by writing, reading back and removing a timestamp key (a throw or mismatch → unavailable); marks initialised; switches to the in-memory fallback when unavailable; runs queued `runAfterInit` callbacks.
- Every key is stored as `key + suffix`; values are `JSON.stringify`-ed on write and `JSON.parse`-d on read.
- `getItemAsync(key)` — after init: fallback map, else localStorage; no `window` → `null`.
- `getItem(key)` — `null` before init; fallback map; localStorage only when `process.env.BROWSER` is set and `window` exists; otherwise `null`.
- `setItem(key, value)` / `removeItem(key)` — run after init; write to the fallback map (`removeItem` stores `null`) or to localStorage.
- `isInitialized()`; `runAfterInit(func)` — runs `func` now when initialised, else queues it.

## Non-functional requirements

- localStorage errors in get/set/remove are swallowed; the read/remove errors log `console.error("Avo Inspector Storage <op> error:", error)` only when the `shouldLog` getter returns true (read live on each error). Failed reads return `null`.
- `setItem` errors are the exception: the **first** write failure per loaded SDK module prints unconditionally, since it means the persisted event queue may not survive unload; later write failures are gated on `shouldLog` (so a full quota does not log per event). A module-scoped `reportedWriteFailure` flag tracks this — shared by every `BrowserAvoStorage` in one loaded copy of the SDK (a page with two inspectors logs it once), while a separately bundled copy, the lite build, or an iframe copy each load the module afresh and keep their own — and is never reset. See AVO-3079.
- `shouldLog` gates read/remove error logging and repeat write failures; storage behaviour itself does not depend on it.
- A stored value that is not valid JSON makes `getItem` throw and `getItemAsync` reject; `parseJson` does not catch.
- Init completes inside the constructor, so `runAfterInit` callbacks run immediately in practice.
