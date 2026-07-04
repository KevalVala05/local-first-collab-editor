import { createGoogle } from "@ai-sdk/google";
import { streamText } from "ai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";
import { checkRateLimit } from "@/lib/rateLimit";
import { ERROR_MESSAGES } from "@/constants/messages";

export const maxDuration = 30; // 30 seconds max duration

export async function POST(req: Request)
{
  try
  {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      return NextResponse.json(
        { message: ERROR_MESSAGES.UNAUTHORIZED },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    // Rate limit check
    checkRateLimit(session.user.id);

    const { action, text, context, targetLanguage, targetTone } = await req.json();

    if (!action)
    {
      return NextResponse.json(
        { message: ERROR_MESSAGES.AI_ACTION_REQUIRED },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    if (!process.env.GEMINI_API_KEY)
    {
      return NextResponse.json(
        { message: ERROR_MESSAGES.GEMINI_KEY_MISSING },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }

    const google = createGoogle({
      apiKey: process.env.GEMINI_API_KEY,
    });

    let prompt = "";
    switch (action)
    {
      case "expand":
        prompt = `You are a helpful AI writing assistant. Continue writing the following text naturally, matching its style, vocabulary, tone, and flow. Do NOT repeat the existing text, just continue it. Context of the document is: "${context || ""}". Text to continue:\n\n"${text}"\n\nOutput only the continuation text. No introductory remarks, no conversational headers, no explanations.`;
        break;
      case "summarize":
        prompt = `You are an AI assistant that excels at summarization. Write a clear, concise summary of the following text:\n\n"${text}"\n\nOutput only the summary text. No introductory remarks, no quotes, no headers.`;
        break;
      case "translate":
        if (!targetLanguage)
        {
          return NextResponse.json(
            { message: ERROR_MESSAGES.AI_LANGUAGE_REQUIRED },
            { status: StatusCodes.BAD_REQUEST }
          );
        }
        prompt = `You are a professional translator. Translate the following text into ${targetLanguage}. Maintain the formatting, tone, and style:\n\n"${text}"\n\nOutput only the translation.`;
        break;
      case "tone":
        if (!targetTone)
        {
          return NextResponse.json(
            { message: ERROR_MESSAGES.AI_TONE_REQUIRED },
            { status: StatusCodes.BAD_REQUEST }
          );
        }
        prompt = `You are an editor. Rephrase the following text to have a ${targetTone} tone. Keep the core meaning exactly the same, but change the vocabulary and styling to match:\n\n"${text}"\n\nOutput only the modified text.`;
        break;
      case "grammar":
        prompt = `You are an expert copyeditor. Fix all spelling mistakes, grammar errors, punctuation mistakes, and improve basic sentence structure in the following text. Do not make it overly verbose or change the meaning:\n\n"${text}"\n\nOutput only the corrected text.`;
        break;
      default:
        return NextResponse.json(
          { message: `${ERROR_MESSAGES.AI_INVALID_ACTION}: ${action}` },
          { status: StatusCodes.BAD_REQUEST }
        );
    }

    // Fallback Gemini models sequence
    const models = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3-flash-preview"
    ];

    let lastError: unknown = null;

    for (const modelName of models)
    {
      try
      {
        console.log(`[AI Copilot] Trying model: ${modelName}`);
        const result = streamText(
          {
            model: google(modelName),
            prompt,
          }
        );
        // Try reading the first chunk to verify the model is accessible and working
        const reader = result.textStream.getReader();
        const { value: firstChunk, done } = await reader.read();

        // If no error was thrown, construct a custom stream that pipes the first chunk and the remaining chunks
        const customStream = new ReadableStream(
          {
            async start(controller)
            {
              if (firstChunk !== undefined)
              {
                controller.enqueue(firstChunk);
              }
              if (done)
              {
                controller.close();
                return;
              }

              try
              {
                while (true)
                {
                  const { value, done: remainingDone } = await reader.read();
                  if (remainingDone) break;
                  controller.enqueue(value);
                }
              }
              catch (streamErr)
              {
                controller.error(streamErr);
              }
              finally
              {
                reader.releaseLock();
                controller.close();
              }
            }
          }
        );

        console.log(`[AI Copilot] Successfully connected with model: ${modelName}`);
        return new Response(customStream, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      catch (err: unknown)
      {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[AI Copilot] Model ${modelName} failed. Error:`, errMsg);
        lastError = err;
      }
    }

    throw lastError || new Error("All fallback Gemini models failed.");
  }
  catch (error: unknown)
  {
    console.error("AI Assistant Error:", error);
    const errorMsg = error instanceof Error ? error.message : ERROR_MESSAGES.AI_FAILED;
    return NextResponse.json(
      { message: errorMsg },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
