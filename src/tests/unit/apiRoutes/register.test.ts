/**
 * @file register.test.ts
 * @description Unit tests for the register route handler (POST /api/auth/register).
 *              Mocks dbConnect, User model, and bcrypt to verify route logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/register/route";
import { User } from "@/models/User";
import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";

// Mock database connection
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

// Mock mongoose models
vi.mock("@/models/User", () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password_xyz"),
  },
}));

describe("POST /api/auth/register — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: Record<string, unknown>) => {
    return new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  it("successfully registers a new user", async () => {
    const payload = {
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
    };

    // User does not exist yet
    vi.mocked(User.findOne).mockResolvedValue(null);

    // Mock User creation return value
    const mockCreatedUser = {
      _id: "mongo_id_123",
      name: "John Doe",
      email: "john@example.com",
      password: "hashed_password_xyz",
    };
    type MockedFunction = {
      mockResolvedValue: (val: unknown) => void;
    };
    (vi.mocked(User.create) as unknown as MockedFunction).mockResolvedValue(mockCreatedUser);

    const req = createRequest(payload);
    const res = await POST(req);
    const body = await res.json();

    expect(User.findOne).toHaveBeenCalledWith({ email: "john@example.com" });
    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);
    expect(User.create).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
      password: "hashed_password_xyz",
    });

    expect(res.status).toBe(StatusCodes.CREATED);
    expect(body.message).toBe(SUCCESS_MESSAGES.REGISTER_SUCCESS);
    expect(body.data.user).toEqual({
      id: "mongo_id_123",
      name: "John Doe",
      email: "john@example.com",
    });
  });

  it("returns CONFLICT if email is already registered", async () => {
    const payload = {
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
    };

    // User already exists
    vi.mocked(User.findOne).mockResolvedValue({
      _id: "existing_id",
      email: "john@example.com",
    } as unknown as ReturnType<typeof User.findOne>);

    const req = createRequest(payload);
    const res = await POST(req);
    const body = await res.json();

    expect(User.findOne).toHaveBeenCalledWith({ email: "john@example.com" });
    expect(User.create).not.toHaveBeenCalled();
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(body.message).toBe(ERROR_MESSAGES.USER_ALREADY_EXISTS);
  });

  it("returns BAD_REQUEST if validation fails (e.g. invalid email)", async () => {
    const payload = {
      name: "J", // too short (min 2)
      email: "bad-email",
      password: "123", // too short (min 6)
    };

    const req = createRequest(payload);
    const res = await POST(req);
    const body = await res.json();

    expect(User.findOne).not.toHaveBeenCalled();
    expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    // Should have validation error messages
    expect(body.message).toBeDefined();
  });
});
