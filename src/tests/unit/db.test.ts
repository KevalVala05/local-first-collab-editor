/**
 * @file db.test.ts
 * @description Unit tests for Mongoose connection helper dbConnect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

describe("dbConnect", () => {
  const originalEnv = process.env.MONGODB_URI;

  beforeEach(() => {
    vi.resetModules();
    // Clear global mongoose cache to isolate test runs
    global.mongoose = undefined;
  });

  afterEach(() => {
    process.env.MONGODB_URI = originalEnv;
    global.mongoose = undefined;
    vi.restoreAllMocks();
  });

  it("should throw an error if MONGODB_URI is not defined", async () => {
    delete process.env.MONGODB_URI;

    await expect(import("@/lib/db")).rejects.toThrow();
  });

  it("should compile successfully and register global cached connection object when MONGODB_URI is defined", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const { default: dbConnect } = await import("@/lib/db");
    expect(dbConnect).toBeDefined();
    expect(global.mongoose).toBeDefined();
    expect(global.mongoose?.conn).toBeNull();
    expect(global.mongoose?.promise).toBeNull();
  });

  it("should return the cached connection if it already exists", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const { default: dbConnect } = await import("@/lib/db");
    const mockMongoose = {} as unknown as typeof mongoose;
    global.mongoose!.conn = mockMongoose;

    const conn = await dbConnect();
    expect(conn).toBe(mockMongoose);
  });

  it("should create a new connection if none exists", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const mockMongooseInstance = {} as unknown as typeof mongoose;
    const spyConnect = vi.spyOn(mongoose, "connect").mockResolvedValue(mockMongooseInstance);

    const { default: dbConnect } = await import("@/lib/db");
    const conn = await dbConnect();

    expect(spyConnect).toHaveBeenCalledTimes(1);
    expect(conn).toBe(mockMongooseInstance);
    expect(global.mongoose?.conn).toBe(mockMongooseInstance);
  });

  it("should reset cached.promise to null and propagate error if connection fails", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    const connectionError = new Error("Connection failed");
    vi.spyOn(mongoose, "connect").mockRejectedValue(connectionError);

    const { default: dbConnect } = await import("@/lib/db");
    
    await expect(dbConnect()).rejects.toThrow("Connection failed");
    expect(global.mongoose?.promise).toBeNull();
    expect(global.mongoose?.conn).toBeNull();
  });

  it("should reuse the existing connection promise if called multiple times concurrently", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";

    let resolvePromise!: (val: typeof mongoose) => void;
    const mockPromise = new Promise<typeof mongoose>((resolve) => {
      resolvePromise = resolve;
    });

    const spyConnect = vi.spyOn(mongoose, "connect").mockReturnValue(mockPromise);

    const { default: dbConnect } = await import("@/lib/db");
    
    // Call twice concurrently
    const p1 = dbConnect();
    const p2 = dbConnect();

    expect(spyConnect).toHaveBeenCalledTimes(1); // Mongoose connect should only be called once

    const mockMongooseInstance = {} as unknown as typeof mongoose;
    resolvePromise(mockMongooseInstance);

    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1).toBe(mockMongooseInstance);
    expect(c2).toBe(mockMongooseInstance);
  });
});
