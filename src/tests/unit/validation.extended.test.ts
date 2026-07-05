/**
 * @file validation.extended.test.ts
 * @description Extended edge-case tests for all Zod validation schemas.
 *              Covers whitespace-only inputs, Unicode edge cases, boundary values,
 *              type coercion safety, and message fidelity.
 */
import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/validation/auth";
import {
  createDocumentSchema,
  updateDocumentSchema,
  shareDocumentSchema,
} from "@/validation/document";
import { DocumentRole } from "@/types/document";
import { ERROR_MESSAGES } from "@/constants/messages";

// ── registerSchema — edge cases ───────────────────────────────────────────────

describe("registerSchema — edge cases", () => {
  it("rejects whitespace-only name after trim", () => {
    const result = registerSchema.safeParse({
      name: "   ",
      email: "a@b.com",
      password: "pass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only email after trim", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "    ",
      password: "pass123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 2-char name (min boundary)", () => {
    const result = registerSchema.safeParse({
      name: "Al",
      email: "al@b.com",
      password: "pass123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 50-char name (max boundary)", () => {
    const result = registerSchema.safeParse({
      name: "A".repeat(50),
      email: "a@b.com",
      password: "pass123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 6-char password (min boundary)", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 100-char password (max boundary)", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "x".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("returns NAME_REQUIRED error message for empty name", () => {
    const result = registerSchema.safeParse({
      name: "",
      email: "a@b.com",
      password: "pass123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(ERROR_MESSAGES.NAME_REQUIRED);
    }
  });

  it("returns INVALID_EMAIL error message for bad email", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "not-an-email",
      password: "pass123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(ERROR_MESSAGES.INVALID_EMAIL);
    }
  });

  it("returns PASSWORD_MIN_LENGTH for 5-char password", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "abcde",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(ERROR_MESSAGES.PASSWORD_MIN_LENGTH);
    }
  });

  it("rejects non-string types for name", () => {
    const result = registerSchema.safeParse({
      name: 12345,
      email: "a@b.com",
      password: "pass123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts Unicode characters in name", () => {
    const result = registerSchema.safeParse({
      name: "Aarav 🇮🇳",
      email: "aarav@example.com",
      password: "pass1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an email with a missing domain extension", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "alice@domain",
      password: "pass123",
    });
    expect(result.success).toBe(false);
  });
});

// ── loginSchema — edge cases ──────────────────────────────────────────────────

describe("loginSchema — edge cases", () => {
  it("rejects empty strings for both fields", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
  });

  it("trims email before validation", () => {
    const result = loginSchema.safeParse({
      email: "  user@test.com  ",
      password: "secure123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@test.com");
    }
  });

  it("rejects extra unknown fields gracefully (Zod strips by default)", () => {
    const result = loginSchema.safeParse({
      email: "user@test.com",
      password: "secure123",
      hackerField: "DROP TABLE users",
    });
    // Zod strips unknown fields by default, so this should succeed
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("hackerField");
    }
  });
});

// ── createDocumentSchema — edge cases ─────────────────────────────────────────

describe("createDocumentSchema — edge cases", () => {
  it("accepts exactly 2-char title (min boundary)", () => {
    const result = createDocumentSchema.safeParse({ title: "AB" });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 100-char title (max boundary)", () => {
    const result = createDocumentSchema.safeParse({ title: "T".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only title after trim", () => {
    const result = createDocumentSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("returns TITLE_MAX_LENGTH message for 101-char title", () => {
    const result = createDocumentSchema.safeParse({ title: "T".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(ERROR_MESSAGES.TITLE_MAX_LENGTH);
    }
  });

  it("returns TITLE_MIN_LENGTH message for single-char title", () => {
    const result = createDocumentSchema.safeParse({ title: "X" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(ERROR_MESSAGES.TITLE_MIN_LENGTH);
    }
  });

  it("rejects non-string title type", () => {
    const result = createDocumentSchema.safeParse({ title: 42 });
    expect(result.success).toBe(false);
  });

  it("strips leading/trailing spaces from title", () => {
    const result = createDocumentSchema.safeParse({ title: "  My Title  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("My Title");
    }
  });
});

// ── updateDocumentSchema — edge cases ─────────────────────────────────────────

describe("updateDocumentSchema — edge cases", () => {
  it("rejects content of exactly 1MB + 1 byte", () => {
    const result = updateDocumentSchema.safeParse({
      content: "x".repeat(1024 * 1024 + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("1MB"))).toBe(true);
    }
  });

  it("accepts HTML with special characters in content", () => {
    const result = updateDocumentSchema.safeParse({
      content: "<p>Hello <strong>World</strong> & <em>italics</em></p>",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty string for content (clearing a document)", () => {
    const result = updateDocumentSchema.safeParse({ content: "" });
    expect(result.success).toBe(true);
  });

  it("rejects title of 1 character", () => {
    const result = updateDocumentSchema.safeParse({ title: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects title of 101 characters", () => {
    const result = updateDocumentSchema.safeParse({ title: "T".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts both fields at their max valid lengths simultaneously", () => {
    const result = updateDocumentSchema.safeParse({
      title: "T".repeat(100),
      content: "c".repeat(1024 * 1024),
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-string content", () => {
    const result = updateDocumentSchema.safeParse({ content: 99999 });
    expect(result.success).toBe(false);
  });
});

// ── shareDocumentSchema — edge cases ──────────────────────────────────────────

describe("shareDocumentSchema — edge cases", () => {
  it("rejects empty role string", () => {
    const result = shareDocumentSchema.safeParse({
      email: "user@test.com",
      role: "",
    });
    expect(result.success).toBe(false);
  });

  it("is case-sensitive for role — 'editor' (lowercase) is rejected", () => {
    const result = shareDocumentSchema.safeParse({
      email: "user@test.com",
      role: "editor", // must be "EDITOR"
    });
    expect(result.success).toBe(false);
  });

  it("is case-sensitive for role — 'viewer' (lowercase) is rejected", () => {
    const result = shareDocumentSchema.safeParse({
      email: "user@test.com",
      role: "viewer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 'OWNER' role", () => {
    const result = shareDocumentSchema.safeParse({
      email: "user@test.com",
      role: DocumentRole.OWNER,
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 2-char email local part", () => {
    const result = shareDocumentSchema.safeParse({
      email: "ab@cd.com",
      role: DocumentRole.EDITOR,
    });
    expect(result.success).toBe(true);
  });

  it("rejects email with 51 characters total", () => {
    // 45 'a's + '@b.com' = 51 chars
    const email = "a".repeat(45) + "@b.com";
    expect(email.length).toBeGreaterThan(50);
    const result = shareDocumentSchema.safeParse({
      email,
      role: DocumentRole.VIEWER,
    });
    expect(result.success).toBe(false);
  });

  it("accepts email of exactly 50 characters", () => {
    // Build a 50-char valid email: 'aaa...@b.com'
    // domain '@b.com' = 6 chars, so local = 44 chars
    const email = "a".repeat(44) + "@b.com";
    expect(email.length).toBe(50);
    const result = shareDocumentSchema.safeParse({
      email,
      role: DocumentRole.EDITOR,
    });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only email", () => {
    const result = shareDocumentSchema.safeParse({
      email: "     ",
      role: DocumentRole.EDITOR,
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from email before validating", () => {
    const result = shareDocumentSchema.safeParse({
      email: "  user@example.com  ",
      role: DocumentRole.VIEWER,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });
});
