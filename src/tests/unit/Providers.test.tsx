import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Providers from "@/components/Providers";

// Mock next-auth SessionProvider
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-session-provider">{children}</div>
  ),
}));

// Mock SyncProvider
vi.mock("@/context/SyncContext", () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-sync-provider">{children}</div>
  ),
}));

// Mock react-toastify ToastContainer
vi.mock("react-toastify", () => ({
  ToastContainer: () => <div data-testid="mock-toast-container" />,
}));

// Mock tanstack react-query
let capturedConfig: unknown = null;
vi.mock("@tanstack/react-query", () => {
  class MockQueryClient {
    constructor(config: unknown) {
      capturedConfig = config;
    }
  }
  return {
    QueryClient: MockQueryClient,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-query-provider">{children}</div>
    ),
  };
});

describe("Providers Component", () => {
  it("renders all provider wrappers and children with correct QueryClient configuration", () => {
    render(
      <Providers>
        <span data-testid="test-child">Child Element</span>
      </Providers>
    );

    // Verify children rendering
    expect(screen.getByTestId("test-child").textContent).toBe("Child Element");

    // Verify provider wrappers are rendered
    expect(screen.getByTestId("mock-session-provider")).toBeInTheDocument();
    expect(screen.getByTestId("mock-query-provider")).toBeInTheDocument();
    expect(screen.getByTestId("mock-sync-provider")).toBeInTheDocument();
    expect(screen.getByTestId("mock-toast-container")).toBeInTheDocument();

    // Verify QueryClient configurations
    expect(capturedConfig).toBeDefined();
    const configObj = capturedConfig as { defaultOptions: { queries: { refetchOnWindowFocus: boolean; retry: boolean } } };
    expect(configObj.defaultOptions.queries.refetchOnWindowFocus).toBe(false);
    expect(configObj.defaultOptions.queries.retry).toBe(false);
  });
});
