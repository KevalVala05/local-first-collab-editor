import mongoose from "mongoose";
import { ERROR_MESSAGES } from "@/constants/messages";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI)
{
  throw new Error(ERROR_MESSAGES.DB_URI_MISSING);
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = (global.mongoose as MongooseCache) ?? { conn: null, promise: null };

if (!global.mongoose)
{
  global.mongoose = cached;
}

async function dbConnect()
{
  if (cached.conn)
  {
    return cached.conn;
  }

  if (!cached.promise)
  {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongooseInstance) =>
    {
      return mongooseInstance;
    });
  }

  try
  {
    cached.conn = await cached.promise;
  }
  catch (e)
  {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
