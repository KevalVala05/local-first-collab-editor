import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { vi } from "vitest";

// Silence console.error in tests (keeps output clean)
vi.spyOn(console, "error").mockImplementation(() => {});
