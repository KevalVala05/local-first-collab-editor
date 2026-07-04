import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { loginSchema } from "@/validation/auth";
import { ERROR_MESSAGES } from "@/constants/messages";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider(
      {
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials)
        {
          if (!credentials?.email || !credentials?.password)
          {
            throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
          }

          // Validate input with Zod schema
          const validation = loginSchema.safeParse(credentials);

          if (!validation.success)
          {
            throw new Error(validation.error.issues[0].message);
          }

          await dbConnect();

          const user = await User.findOne({ email: credentials.email.toLowerCase() });

          if (!user)
          {
            throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
          }

          const isPasswordCorrect = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordCorrect)
          {
            throw new Error(ERROR_MESSAGES.INCORRECT_PASSWORD);
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
          };
        },
      }
    ),
  ],
  callbacks: {
    async jwt({ token, user })
    {
      if (user)
      {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token })
    {
      if (session.user)
      {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
