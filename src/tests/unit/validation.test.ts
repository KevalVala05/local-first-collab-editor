/**
 * @file validation.test.ts
 * @description Unit tests for all Zod validation schemas.
 *              Covers auth (register/login) and document (create/update/share) schemas.
 */
import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/validation/auth";
import {
  createDocumentSchema,
  updateDocumentSchema,
  shareDocumentSchema,
} from "@/validation/document";
import { DocumentRole } from "@/types/document";

// ── Auth Schemas ──────────────────────────────────────────────────────────────

describe("registerSchema", () => {
  it("passes with valid credentials", () => {
    const result = registerSchema.safeParse({
      name: "Alice Smith",
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects single-character name (min 2)", () => {
    const result = registerSchema.safeParse({
      name: "A",
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 50 characters", () => {
    const result = registerSchema.safeParse({
      name: "A".repeat(51),
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 6 characters", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      password: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 100 characters", () => {
    const result = registerSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      password: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name and email", () => {
    const result = registerSchema.safeParse({
      name: "  Alice  ",
      email: "  alice@example.com  ",
      password: "secret123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Alice");
      expect(result.data.email).toBe("alice@example.com");
    }
  });
});

describe("loginSchema", () => {
  it("passes with valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({ password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({ email: "alice@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "bad-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });
});

// ── Document Schemas ──────────────────────────────────────────────────────────

describe("createDocumentSchema", () => {
  it("passes with a valid title", () => {
    const result = createDocumentSchema.safeParse({ title: "My Document" });
    expect(result.success).toBe(true);
  });

  it("passes with no title (optional)", () => {
    const result = createDocumentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a title longer than 100 characters", () => {
    const result = createDocumentSchema.safeParse({ title: "T".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects a single-character title (min 2)", () => {
    const result = createDocumentSchema.safeParse({ title: "A" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from title", () => {
    const result = createDocumentSchema.safeParse({ title: "  My Doc  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("My Doc");
    }
  });
});

describe("updateDocumentSchema", () => {
  it("passes with only title", () => {
    const result = updateDocumentSchema.safeParse({ title: "Updated Title" });
    expect(result.success).toBe(true);
  });

  it("passes with only content", () => {
    const result = updateDocumentSchema.safeParse({
      content: "<p>Some HTML content</p>",
    });
    expect(result.success).toBe(true);
  });

  it("passes with both title and content", () => {
    const result = updateDocumentSchema.safeParse({
      title: "Title",
      content: "<p>Content</p>",
    });
    expect(result.success).toBe(true);
  });

  it("passes with empty object (all optional)", () => {
    const result = updateDocumentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects content exceeding 1MB", () => {
    const result = updateDocumentSchema.safeParse({
      content: "x".repeat(1024 * 1024 + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts content exactly at 1MB boundary", () => {
    const result = updateDocumentSchema.safeParse({
      content: "x".repeat(1024 * 1024),
    });
    expect(result.success).toBe(true);
  });
});

describe("shareDocumentSchema", () => {
  it("passes with valid email and editor role", () => {
    const result = shareDocumentSchema.safeParse({
      email: "editor@example.com",
      role: DocumentRole.EDITOR,
    });
    expect(result.success).toBe(true);
  });

  it("passes with viewer role", () => {
    const result = shareDocumentSchema.safeParse({
      email: "viewer@example.com",
      role: DocumentRole.VIEWER,
    });
    expect(result.success).toBe(true);
  });

  it("rejects owner role (not in enum)", () => {
    const result = shareDocumentSchema.safeParse({
      email: "owner@example.com",
      role: "owner",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = shareDocumentSchema.safeParse({
      email: "not-an-email",
      role: DocumentRole.EDITOR,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = shareDocumentSchema.safeParse({ role: DocumentRole.EDITOR });
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const result = shareDocumentSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects email exceeding 50 characters", () => {
    const result = shareDocumentSchema.safeParse({
      email: "a".repeat(45) + "@b.com",
      role: DocumentRole.VIEWER,
    });
    expect(result.success).toBe(false);
  });
});
