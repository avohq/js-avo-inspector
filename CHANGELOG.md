# Changelog

All notable changes to `react-native-avo-inspector` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`enableLogging(false)` now silences dev logs.** In `Dev`, the constructor always turned logging on and passed that value to storage, the event spec cache and the event spec fetcher. As a result, a later `enableLogging(false)` didn't reach them, and `AvoInspector.shouldLog = false` set before construction was overwritten.
  - The environment default (Dev on, Staging/Prod off) now only applies when you haven't set logging explicitly with `enableLogging()` or `AvoInspector.shouldLog`.
  - `enableLogging()` now passes the new value to the storage, cache and fetcher that already exist, so it takes effect immediately.
  - **Behaviour change:** an explicit logging preference now persists across instances. After `enableLogging(false)` or `AvoInspector.shouldLog = false`, a new `AvoInspector` no longer turns logging back on in `Dev`.
- **Android: the Inspector no longer reads or logs the host app's AsyncStorage.** At startup, the Android storage loaded every AsyncStorage key into memory. With logging on, it also printed every key and value, which could include other libraries' tokens or user data. It now only reads the Inspector's own keys (prefixed with `AvoInspector`) and logs a single `loaded N cached items` summary line when logging is on.

Errors that are always printed (such as a storage init failure or a failed track call) still print regardless of the logging setting.
