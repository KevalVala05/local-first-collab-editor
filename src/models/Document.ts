import mongoose, { Schema } from "mongoose";
import { DocumentRole } from "@/types/document";

const CollaboratorSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(DocumentRole),
      required: true,
    },
  },
  {
    _id: false,
  }
);

const DocumentSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
      default: "Untitled Document",
    },
    content: {
      type: String,
      default: "",
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    currentVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    collaborators: [CollaboratorSchema],
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure faster queries when finding documents a user has access to
DocumentSchema.index({ ownerId: 1 });
DocumentSchema.index({ "collaborators.userId": 1 });

export const Document = mongoose.models.Document || mongoose.model("Document", DocumentSchema);
