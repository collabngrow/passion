// Stub for the `server-only` package under test.
//
// The real module throws when imported outside a React Server Component graph.
// That guard is a build-time boundary; the server modules it protects are
// exactly what the unit tests need to import directly.
export {};
