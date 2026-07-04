import mongoose, { Schema } from "mongoose";

const SnapshotSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

SnapshotSchema.index({ documentId: 1, version: -1 });

export const Snapshot = mongoose.models.Snapshot || mongoose.model("Snapshot", SnapshotSchema);
