import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      // Raw validation of 100 chars is done at Zod level, and bcrypt hash takes 60 chars.
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 50,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
