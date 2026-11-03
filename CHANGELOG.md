# Changelog

All notable changes to `react-native-avo-inspector` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

### Upgrading

Before upgrading, remove any leftover `enableLogging(true)` or `AvoInspector.shouldLog = true` calls (for example from a debugging session). A later `Prod` or `Staging` inspector no longer cancels them, so logging would stay on in production. A fresh app launch starts from the environment default.

### Changed

- **BREAKING: an explicit logging preference is now sticky and applies to every inspector.** Calling `enableLogging(...)` or setting `AvoInspector.shouldLog` is remembered, and the environment default (Dev on, Staging/Prod off) only applies when you haven't set one.
  - `false`: after `enableLogging(false)` or `AvoInspector.shouldLog = false`, a new `Dev` inspector no longer turns logging back on.
  - `true`: after `enableLogging(true)` or `AvoInspector.shouldLog = true`, a new `Prod` or `Staging` inspector no longer turns logging off. Before this change the constructor reset it, so Prod stays silent only if you never opt in. With logging on, Prod prints every gated log, including event batches.
- **BREAKING (Android): the synchronous storage read is no longer supported.** In 1.x, `AvoInspector.avoStorage.getItem(key)` returned the value from the in-memory copy loaded at startup. That copy is gone (see the Android entry under "Fixed"), so `getItem` now throws. Use `getItemAsync`. `isInitialized()` is now true as soon as AsyncStorage is loaded, and `runAfterInit` runs its callback immediately, since there is no startup load to wait for.

### Fixed

- **`enableLogging(false)` now silences dev logs.** In `Dev`, the constructor always turned logging on and passed that value to storage, the event spec cache and the event spec fetcher, so a later `enableLogging(false)` didn't reach them, and `AvoInspector.shouldLog = false` set before construction was overwritten. These components now read the flag live, so `enableLogging()` and `AvoInspector.shouldLog` apply immediately to every inspector already created.
- **`EventValidator` warnings now respect the logging setting.** The unsafe/invalid regex, regex timeout, stringify failure, invalid allowed-values, NaN and invalid min/max warnings printed even after `enableLogging(false)`.
- **The cache-hit log no longer prints the API key.** It now logs only the stream id and event name.
- **Android: the Inspector no longer enumerates and bulk-loads the host app's AsyncStorage at startup.** The startup load copied every AsyncStorage key into memory and, with logging on, printed every key and value, which could include other libraries' tokens or user data. `AvoBatcher` still reads the cached-events key at startup through `getItemAsync`; the all-keys in-memory load is removed. This also stops an uncaught `TypeError` on every inspector start with AsyncStorage v3, which has no `multiGet`.

Errors that are always printed (such as a storage init failure or a failed track call) still print regardless of the logging setting.
