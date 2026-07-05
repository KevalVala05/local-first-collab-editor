/**
 * @file models.test.ts
 * @description Unit tests for verifying Mongoose model schemas, field constraints, and indexes.
 */
import { describe, it, expect } from "vitest";
import { Document } from "@/models/Document";
import { Snapshot } from "@/models/Snapshot";

describe("Mongoose Models — Document", () => {
  it("compiles the Document model successfully", () => {
    expect(Document).toBeDefined();
    expect(Document.modelName).toBe("Document");
  });

  it("defines the expected schema paths and configuration for Document", () => {
    const paths = Document.schema.paths;

    expect(paths.title).toBeDefined();
    expect(paths.title.instance).toBe("String");
    expect(paths.title.options.required).toBe(true);
    expect(paths.title.options.minlength).toBe(2);
    expect(paths.title.options.maxlength).toBe(100);

    expect(paths.content).toBeDefined();
    expect(paths.content.instance).toBe("String");

    expect(paths.ownerId).toBeDefined();
    expect(paths.ownerId.instance).toBe("ObjectId");
    expect(paths.ownerId.options.ref).toBe("User");
    expect(paths.ownerId.options.required).toBe(true);

    expect(paths.currentVersion).toBeDefined();
    expect(paths.currentVersion.instance).toBe("Number");
    expect(paths.currentVersion.options.default).toBe(0);
    expect(paths.currentVersion.options.required).toBe(true);

    expect(paths.collaborators).toBeDefined();
  });

  it("defines indexes for Document", () => {
    const indexes = Document.schema.indexes();
    const indexFields = indexes.map((idx: [Record<string, number>, Record<string, unknown>]) => Object.keys(idx[0])[0]);

    expect(indexFields).toContain("ownerId");
    expect(indexFields).toContain("collaborators.userId");
  });
});

describe("Mongoose Models — Snapshot", () => {
  it("compiles the Snapshot model successfully", () => {
    expect(Snapshot).toBeDefined();
    expect(Snapshot.modelName).toBe("Snapshot");
  });

  it("defines the expected schema paths and configuration for Snapshot", () => {
    const paths = Snapshot.schema.paths;

    expect(paths.documentId).toBeDefined();
    expect(paths.documentId.instance).toBe("ObjectId");
    expect(paths.documentId.options.ref).toBe("Document");
    expect(paths.documentId.options.required).toBe(true);

    expect(paths.version).toBeDefined();
    expect(paths.version.instance).toBe("Number");
    expect(paths.version.options.required).toBe(true);

    expect(paths.title).toBeDefined();
    expect(paths.title.instance).toBe("String");
    expect(paths.title.options.required).toBe(true);

    expect(paths.content).toBeDefined();
    expect(paths.content.instance).toBe("String");
    expect(paths.content.options.required).toBe(true);

    expect(paths.createdBy).toBeDefined();
    expect(paths.createdBy.instance).toBe("ObjectId");
    expect(paths.createdBy.options.ref).toBe("User");
    expect(paths.createdBy.options.required).toBe(true);
  });

  it("defines indexes for Snapshot", () => {
    const indexes = Snapshot.schema.indexes();
    const compoundIndex = indexes.find((idx: [Record<string, number>, Record<string, unknown>]) => {
      const keys = Object.keys(idx[0]);
      return keys.includes("documentId") && keys.includes("version");
    });

    expect(compoundIndex).toBeDefined();
  });
});
