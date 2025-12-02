# Project Context

This is the **Avo Inspector JavaScript SDK** - a client-side library that tracks analytics event schemas and validates them against Avo's tracking plan.

## Key Concepts

- **streamId** (formerly `anonymousId`) - Ephemeral identifier that resets after 4 hours of age AND 2 hours of idle time
- Storage keys use prefix `AvoInspector*` (e.g., `AvoInspectorStreamId`, `AvoInspectorStreamIdCreatedAt`)
- Event validation uses `getEventSpec` API which returns `branchId` in metadata
- `validatedBranchId` is included in event payloads when value validation is performed

## Project Structure

- `src/AvoInspector.ts` - Main SDK entry point
- `src/AvoStreamId.ts` - Manages ephemeral stream identifiers
- `src/AvoNetworkCallsHandler.ts` - API communication, event body types
- `src/eventSpec/` - Event spec fetching, caching, and validation
- `src/__tests__/` - Jest test files

## Development

```bash
npm test          # Run tests
npm run build     # TypeScript compile + webpack bundle
```

## Commit Conventions

- Reference Linear issues as `AVO-XXXX` in commit messages
- Single feature = single commit (don't split tightly coupled changes)
- Format: Brief title, then bullet points for details

## Testing Notes

- Some Batcher tests are flaky due to timing - not a blocker if StreamId/NetworkCallsHandler tests pass
- Run relevant test subset with: `npm test -- --testPathPattern="TestName"`

## Environments

- **Dev**: Batch size = 1, logging enabled, spec fetching enabled
- **Staging**: Batch size = 30, logging disabled, spec fetching enabled
- **Prod**: Batch size = 30, logging disabled, NO spec fetching
