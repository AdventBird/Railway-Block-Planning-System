import { defineConfig } from "vitest/config";

// Pure-logic frontend tests (no DOM needed): time math, planner payload
// normalisation and the canonical↔seed id bridge.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
