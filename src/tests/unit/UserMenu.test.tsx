import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserMenu from "@/components/UserMenu";
import { signOut } from "next-auth/react";
import { toastSuccess } from "@/lib/toast";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
}));

describe("UserMenu Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly with user name, email, and correctly calculates initials", () => {
    const user = { name: "John Doe", email: "john@example.com" };
    render(<UserMenu user={user} />);

    expect(screen.getByText("John Doe")).not.toBeNull();
    expect(screen.getByText("Account Owner")).not.toBeNull();
    // Initials should be JD
    expect(screen.getByText("JD")).not.toBeNull();
  });

  it("handles empty name/email fallbacks cleanly", () => {
    const user = { name: null, email: null };
    render(<UserMenu user={user} />);

    // Name falls back to "User" -> initials "U"
    expect(screen.getByText("User")).not.toBeNull();
    expect(screen.getByText("U")).not.toBeNull();
  });

  it("toggles the dropdown menu when trigger button is clicked", () => {
    const user = { name: "Alice", email: "alice@test.com" };
    render(<UserMenu user={user} />);

    // Initially closed, dropdown options should not be visible
    expect(screen.queryByText("Signed in as")).toBeNull();

    // Click trigger to open
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Signed in as")).not.toBeNull();
    expect(screen.getByText("alice@test.com")).not.toBeNull();

    // Click trigger to close
    fireEvent.click(trigger);
    expect(screen.queryByText("Signed in as")).toBeNull();
  });

  it("closes the dropdown when user clicks outside the component", () => {
    const user = { name: "Alice", email: "alice@test.com" };
    render(<UserMenu user={user} />);

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Signed in as")).not.toBeNull();

    // Click outside on the document body
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Signed in as")).toBeNull();
  });

  it("does not close the dropdown when user clicks inside the dropdown menu", () => {
    const user = { name: "Alice", email: "alice@test.com" };
    render(<UserMenu user={user} />);

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Signed in as")).not.toBeNull();

    // Click on the dropdown title text
    const textNode = screen.getByText("Signed in as");
    fireEvent.mouseDown(textNode);

    // The dropdown should still be open
    expect(screen.getByText("Signed in as")).not.toBeNull();
  });

  it("performs signOut and redirects on logout button click", async () => {
    const user = { name: "Alice", email: "alice@test.com" };
    render(<UserMenu user={user} />);

    // Open dropdown
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    // Click sign out button
    const logoutBtn = screen.getByRole("button", { name: /Sign Out/i });
    fireEvent.click(logoutBtn);

    // Assert signOut call, toast message, and router redirect
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(toastSuccess).toHaveBeenCalledWith("Signed out successfully!");
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
