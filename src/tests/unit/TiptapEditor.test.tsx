import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import TiptapEditor, { TiptapEditorRef } from "@/components/TiptapEditor";
import { DocumentRole } from "@/types/document";
import { saveDocumentLocally, localDb } from "@/lib/localDb";
import api from "@/lib/api";
import { toastError } from "@/lib/toast";

// Mock localDb
vi.mock("@/lib/localDb", () => {
  const mockDb = {
    documents: {
      get: vi.fn(),
      put: vi.fn(),
    },
    outbox: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockImplementation((cb) => {
        if (typeof cb === "function") {
          cb({ action: "update_content" });
        }
        return mockDb.outbox;
      }),
      first: vi.fn(),
      delete: vi.fn(),
    },
  };
  return {
    saveDocumentLocally: vi.fn(),
    localDb: mockDb,
  };
});

// Mock api
vi.mock("@/lib/api", () => {
  const mockPatch = vi.fn();
  return {
    default: {
      patch: mockPatch,
    },
    patch: mockPatch,
  };
});

// Mock toast
vi.mock("@/lib/toast", () => ({
  toastError: vi.fn(),
}));

// Mock Tiptap StarterKit & Extensions
vi.mock("@tiptap/starter-kit", () => ({
  default: {
    configure: vi.fn().mockReturnThis(),
  },
}));
vi.mock("@tiptap/extension-placeholder", () => ({
  default: {
    configure: vi.fn().mockReturnThis(),
  },
}));
vi.mock("@tiptap/extension-character-count", () => ({
  default: {},
}));
vi.mock("@tiptap/extension-collaboration", () => ({
  default: {
    configure: vi.fn().mockReturnThis(),
  },
}));

// Define strict types for our Mock Editor structure to satisfy TS / ESLint
interface MockEditorChain {
  focus: () => MockEditorChain;
  toggleBold: () => MockEditorChain;
  toggleItalic: () => MockEditorChain;
  toggleStrike: () => MockEditorChain;
  toggleHeading: (_options?: unknown) => MockEditorChain;
  toggleBulletList: () => MockEditorChain;
  toggleOrderedList: () => MockEditorChain;
  toggleCodeBlock: () => MockEditorChain;
  toggleBlockquote: () => MockEditorChain;
  undo: () => MockEditorChain;
  redo: () => MockEditorChain;
  run: () => void;
}

interface MockEditor {
  commands: {
    setContent: ReturnType<typeof vi.fn>;
    deleteSelection: ReturnType<typeof vi.fn>;
    insertContentAt: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    deleteRange: ReturnType<typeof vi.fn>;
  };
  state: {
    selection: { from: number; to: number };
    doc: {
      textBetween: ReturnType<typeof vi.fn>;
    };
  };
  getText: ReturnType<typeof vi.fn>;
  getHTML: ReturnType<typeof vi.fn>;
  storage: {
    characterCount?: {
      words: ReturnType<typeof vi.fn>;
    };
  };
  chain: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
}

// Mock `@tiptap/react`
let capturedOnUpdate: ((props: { editor: MockEditor }) => void) | null = null;
let mockEditorInstance: MockEditor | null = null;
let returnNullEditor = false;

vi.mock("@tiptap/react", () => {
  const useEditorMock = (options: { onUpdate?: (props: { editor: MockEditor }) => void }) => {
    capturedOnUpdate = options.onUpdate || null;

    const [editor] = React.useState<MockEditor>(() => {
      const chainFocusMock: MockEditorChain = {
        focus: vi.fn().mockReturnThis(),
        toggleBold: vi.fn().mockReturnThis(),
        toggleItalic: vi.fn().mockReturnThis(),
        toggleStrike: vi.fn().mockReturnThis(),
        toggleHeading: vi.fn().mockReturnThis(),
        toggleBulletList: vi.fn().mockReturnThis(),
        toggleOrderedList: vi.fn().mockReturnThis(),
        toggleCodeBlock: vi.fn().mockReturnThis(),
        toggleBlockquote: vi.fn().mockReturnThis(),
        undo: vi.fn().mockReturnThis(),
        redo: vi.fn().mockReturnThis(),
        run: vi.fn(),
      };

      const instance: MockEditor = {
        commands: {
          setContent: vi.fn(),
          deleteSelection: vi.fn(),
          insertContentAt: vi.fn(),
          focus: vi.fn(),
          deleteRange: vi.fn(),
        },
        state: {
          selection: { from: 0, to: 10 },
          doc: {
            textBetween: vi.fn().mockImplementation(() => "mock text"),
          },
        },
        getText: vi.fn().mockReturnValue("mock text"),
        getHTML: vi.fn().mockReturnValue("<p>mock HTML</p>"),
        storage: {
          characterCount: {
            words: vi.fn().mockReturnValue(12),
          },
        },
        chain: vi.fn().mockImplementation(() => chainFocusMock),
        isActive: vi.fn().mockReturnValue(false),
      };

      mockEditorInstance = instance;
      return instance;
    });

    if (returnNullEditor) {
      mockEditorInstance = null;
      return null;
    }

    // Make sure our global reference matches the active state of the component hook
    mockEditorInstance = editor;

    return editor;
  };

  return {
    useEditor: useEditorMock,
    EditorContent: () => <div data-testid="mock-editor-content" />,
  };
});

// Mock Yjs & y-websocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockProviderInstance: any = null;
let mockXmlFragmentLength = 0;
let mockWebsocketSynced = false;

vi.mock("yjs", () => {
  return {
    Doc: class MockDoc {
      clientID = 999;
      getXmlFragment = vi.fn().mockReturnValue({
        get length() {
          return mockXmlFragmentLength;
        },
      });
      destroy = vi.fn();
    },
  };
});

vi.mock("y-websocket", () => {
  class MockWebsocketProvider {
    listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    synced = mockWebsocketSynced;
    awareness = {
      listeners: {} as Record<string, ((...args: unknown[]) => void)[]>,
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!this.awareness.listeners[event]) this.awareness.listeners[event] = [];
        this.awareness.listeners[event].push(cb);
      }),
      off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!this.awareness.listeners[event]) return;
        this.awareness.listeners[event] = this.awareness.listeners[event].filter(l => l !== cb);
      }),
      setLocalState: vi.fn(),
    };

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockProviderInstance = this;
      this.synced = mockWebsocketSynced;
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    }

    off(event: string, cb: (...args: unknown[]) => void) {
      if (!this.listeners[event]) return;
      this.listeners[event] = this.listeners[event].filter(l => l !== cb);
    }

    disconnect = vi.fn();
  }

  return {
    WebsocketProvider: MockWebsocketProvider,
  };
});

describe("TiptapEditor Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockXmlFragmentLength = 0;
    mockWebsocketSynced = false;
    capturedOnUpdate = null;
    mockEditorInstance = null;
    mockProviderInstance = null;
    returnNullEditor = false;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(global, "fetch").mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    documentId: "doc_123",
    initialContent: "<p>Initial content</p>",
    userRole: DocumentRole.EDITOR,
    title: "Document Title",
    userName: "Alice",
    userEmail: "alice@test.com",
  };

  it("renders editor, stats, and handles content seeding", async () => {
    render(<TiptapEditor {...defaultProps} />);

    expect(screen.getByTestId("mock-editor-content")).toBeInTheDocument();
    expect(screen.getByText("0 words")).toBeInTheDocument();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();

    // Trigger websocket sync
    act(() => {
      mockProviderInstance.listeners["sync"]?.forEach((cb: (synced: boolean) => void) => cb(true));
    });

    expect(mockEditorInstance!.commands.setContent).toHaveBeenCalledWith("<p>Initial content</p>");
  });

  it("seeds content immediately if provider is already synced", () => {
    mockWebsocketSynced = true;
    render(<TiptapEditor {...defaultProps} />);

    expect(mockEditorInstance!.commands.setContent).toHaveBeenCalled();
  });

  it("seeds content offline or by timeout", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<TiptapEditor {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockEditorInstance!.commands.setContent).toHaveBeenCalled();
  });

  it("does not seed content if fragment is already populated", () => {
    mockXmlFragmentLength = 5;
    render(<TiptapEditor {...defaultProps} />);

    act(() => {
      mockProviderInstance.listeners["sync"]?.forEach((cb: (synced: boolean) => void) => cb(true));
    });

    expect(mockEditorInstance!.commands.setContent).not.toHaveBeenCalled();
  });

  it("tracks connection status connected/disconnected/connecting", () => {
    render(<TiptapEditor {...defaultProps} />);

    act(() => {
      mockProviderInstance.listeners["status"]?.forEach((cb: (status: { status: string }) => void) =>
        cb({ status: "connected" })
      );
    });
    expect(screen.getByText("Live")).toBeInTheDocument();

    act(() => {
      mockProviderInstance.listeners["status"]?.forEach((cb: (status: { status: string }) => void) =>
        cb({ status: "disconnected" })
      );
    });
    expect(screen.getByText("Offline")).toBeInTheDocument();

    act(() => {
      mockProviderInstance.listeners["status"]?.forEach((cb: (status: { status: string }) => void) =>
        cb({ status: "connecting" })
      );
    });
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("tracks awareness presence updates", () => {
    render(<TiptapEditor {...defaultProps} />);

    const otherUserStates = new Map([
      [10, { user: { name: "Bob", color: "#123456" } }],
      [11, { user: { name: "Charlie", color: "#654321" } }],
      [999, { user: { name: "Self", color: "#654321" } }],
      [12, { user: null }],
      [13, { user: { name: "", color: "" } }],
    ]);

    mockProviderInstance.awareness.getStates.mockReturnValue(otherUserStates);

    act(() => {
      mockProviderInstance.awareness.listeners["change"]?.forEach((cb: () => void) => cb());
    });

    expect(screen.getByText("Also here:")).toBeInTheDocument();
    expect(screen.getByTitle("Bob")).toBeInTheDocument();
    expect(screen.getByTitle("Charlie")).toBeInTheDocument();
    expect(screen.getByTitle("Anonymous")).toBeInTheDocument();
  });

  it("renders +N collaborators badge when count > 5", () => {
    render(<TiptapEditor {...defaultProps} />);

    const otherUserStates = new Map([
      [10, { user: { name: "User1", color: "#1" } }],
      [11, { user: { name: "User2", color: "#2" } }],
      [12, { user: { name: "User3", color: "#3" } }],
      [13, { user: { name: "User4", color: "#4" } }],
      [14, { user: { name: "User5", color: "#5" } }],
      [15, { user: { name: "User6", color: "#6" } }],
    ]);

    mockProviderInstance.awareness.getStates.mockReturnValue(otherUserStates);

    act(() => {
      mockProviderInstance.awareness.listeners["change"]?.forEach((cb: () => void) => cb());
    });

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("handles viewer read-only role banner, toolbar exclusion, and editable attribute", () => {
    render(<TiptapEditor {...defaultProps} userRole={DocumentRole.VIEWER} />);

    expect(screen.getByText(/View-Only Mode/)).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("exposes setContent forwardRef function", () => {
    const ref = createRef<TiptapEditorRef>();
    render(<TiptapEditor {...defaultProps} ref={ref} />);

    act(() => {
      ref.current?.setContent("<p>Manual set content</p>");
    });

    expect(mockEditorInstance!.commands.setContent).toHaveBeenCalledWith("<p>Manual set content</p>");
  });

  it("handles autosave debounced calls on update", () => {
    render(<TiptapEditor {...defaultProps} />);

    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });

    // Fast-forward autosave debounce timeout (2000ms)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(saveDocumentLocally).toHaveBeenCalledWith("doc_123", "<p>mock HTML</p>");
  });

  it("deletes update_content item from outbox if saved successfully while online", async () => {
    const outboxItem = { id: 100, action: "update_content" };
    const outboxMock = localDb.outbox as unknown as { first: ReturnType<typeof vi.fn> };
    vi.mocked(outboxMock.first).mockResolvedValueOnce(outboxItem);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(localDb.documents.get).mockResolvedValueOnce({ _id: "doc_123" } as any);

    render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(api.patch).toHaveBeenCalledWith("/documents/doc_123", { content: "<p>mock HTML</p>" });
    expect(localDb.outbox.delete).toHaveBeenCalledWith(100);
    expect(screen.getByText("✓ Saved")).toBeInTheDocument();
  });

  it("does not delete outbox item if id is undefined", async () => {
    const outboxItem = { id: undefined, action: "update_content" };
    const outboxMock = localDb.outbox as unknown as { first: ReturnType<typeof vi.fn> };
    vi.mocked(outboxMock.first).mockResolvedValueOnce(outboxItem);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(localDb.documents.get).mockResolvedValueOnce({ _id: "doc_123" } as any);

    render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(localDb.outbox.delete).not.toHaveBeenCalled();
  });

  it("silently completes save when offline (treating it as local save)", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByText("✓ Saved")).toBeInTheDocument();
  });

  it("displays save failure on server error", async () => {
    const serverError = new Error("API failure");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serverError as any).response = { status: 500, data: {} };
    vi.mocked(api.patch).mockRejectedValueOnce(serverError);

    render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText("⚠ Save failed")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("API failure");
  });

  it("displays silent local save on server network error", async () => {
    const networkError = {};
    vi.mocked(api.patch).mockRejectedValueOnce(networkError);

    render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText("✓ Saved")).toBeInTheDocument();
  });

  it("handles keyboard event Ctrl+S manual save", () => {
    render(<TiptapEditor {...defaultProps} />);

    act(() => {
      const event = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
      window.dispatchEvent(event);
    });

    expect(saveDocumentLocally).toHaveBeenCalled();
  });

  it("triggers AI menu, selects action/tone, and generates streaming content with selection", async () => {
    render(<TiptapEditor {...defaultProps} />);

    // Mock Selected Text after rendering
    mockEditorInstance!.state.selection = { from: 5, to: 15 };
    mockEditorInstance!.state.doc.textBetween.mockImplementation((from: number, to: number) => {
      if (from === 5 && to === 15) return "1234567890";
      return "";
    });

    // Trigger AI menu button click
    const aiBtn = screen.getByText("✨ AI Copilot");
    fireEvent.click(aiBtn);

    expect(screen.getByText("AI Copilot")).toBeInTheDocument();
    expect(screen.getByText("10 chars selected")).toBeInTheDocument();

    // Change action to tone and select excited
    const toneBtn = screen.getByText("Tone");
    fireEvent.click(toneBtn);

    const toneSelect = screen.getByRole("combobox");
    fireEvent.change(toneSelect, { target: { value: "Excited" } });

    // Mock response streaming
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("Excited AI content ") })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse as any);

    // Click generate button
    const generateBtn = screen.getByText("Generate ✨");
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "tone",
          text: "1234567890",
          context: "mock text",
          targetLanguage: "Spanish",
          targetTone: "Excited",
        }),
      })
    );

    expect(mockEditorInstance!.commands.deleteSelection).toHaveBeenCalled();
    expect(mockEditorInstance!.commands.insertContentAt).toHaveBeenCalledWith(5, "Excited AI content ");
  });

  it("handles AI stream API failures", async () => {
    render(<TiptapEditor {...defaultProps} />);

    // Open AI assistant menu
    const aiBtn = screen.getByText("✨ AI Copilot");
    fireEvent.click(aiBtn);

    const mockResponse = {
      ok: false,
      json: vi.fn().mockResolvedValueOnce({ message: "Quota exceeded" }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse as any);

    const generateBtn = screen.getByText("Generate ✨");
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    expect(toastError).toHaveBeenCalledWith("Quota exceeded");
  });

  it("handles AI stream abort on cancellation", async () => {
    render(<TiptapEditor {...defaultProps} />);

    // Open AI assistant menu
    const aiBtn = screen.getByText("✨ AI Copilot");
    fireEvent.click(aiBtn);

    let resolveFetch: ((value: Response | PromiseLike<Response>) => void) | null = null;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(global, "fetch").mockReturnValueOnce(fetchPromise);

    // Click generate to start the request
    const generateBtn = screen.getByText("Generate ✨");
    act(() => {
      fireEvent.click(generateBtn);
    });

    // Click cancel button
    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    const abortError = new Error("AI generation aborted by user.");
    abortError.name = "AbortError";
    await act(async () => {
      resolveFetch!(Promise.reject(abortError));
    });

    // Confirm loading state finishes
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("triggers toolbar formatting buttons and triggers /ai prefix popup", async () => {
    render(<TiptapEditor {...defaultProps} />);

    // Click format buttons
    const formatButtons = [
      "Bold",
      "Italic",
      "Strikethrough",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bullet List",
      "Ordered List",
      "Code Block",
      "Blockquote",
      "Undo",
      "Redo",
    ];

    for (const label of formatButtons) {
      const btn = screen.getByTitle(label);
      fireEvent.click(btn);
    }

    // Click dividers for coverage
    const dividerTitles = ["divider", "divider2", "divider3", "divider4", "divider5"];
    for (const title of dividerTitles) {
      const divider = screen.getByTitle(title);
      fireEvent.click(divider);
    }

    // Expect format runs
    expect(mockEditorInstance!.chain).toHaveBeenCalled();

    // Simulate typing "/ai" in editor
    mockEditorInstance!.state.selection = { from: 3, to: 3 };
    mockEditorInstance!.state.doc.textBetween.mockImplementation((from: number, to: number) => {
      if (from === 0 && to === 3) return "/ai";
      return "";
    });

    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });

    expect(mockEditorInstance!.commands.deleteRange).toHaveBeenCalledWith({ from: 0, to: 3 });
    expect(screen.getByText("AI Copilot")).toBeInTheDocument();

    // Click AI close button
    const closeBtn = screen.getByText("✕");
    fireEvent.click(closeBtn);
    expect(screen.queryByText("AI Copilot")).not.toBeInTheDocument();
  });

  it("covers additional edge cases and branch coverage paths", async () => {
    // 1. err instanceof Error check with non-Error object rejection
    const nonErrorObject = { response: { status: 500 } };
    vi.mocked(api.patch).mockRejectedValueOnce(nonErrorObject);

    const { unmount } = render(<TiptapEditor {...defaultProps} />);

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText("⚠ Save failed")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("Failed to save");
    unmount();

    // 2. test keydown handlers for Ctrl+S with different key combinations
    const { unmount: unmountKey } = render(<TiptapEditor {...defaultProps} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: false, key: "s" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }));
    });
    unmountKey();

    // 3. test isReadOnly return on update
    const { unmount: unmountReadOnly } = render(<TiptapEditor {...defaultProps} userRole={DocumentRole.VIEWER} />);
    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });
    unmountReadOnly();

    // 4. wordCount optional chaining / ?? 0 fallback
    const { unmount: unmountOptional } = render(<TiptapEditor {...defaultProps} />);
    mockEditorInstance!.storage = {};
    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });
    expect(screen.getByText("0 words")).toBeInTheDocument();
    unmountOptional();

    // 5. saveTimerRef clearing on consecutive onUpdates
    const { unmount: unmountSave } = render(<TiptapEditor {...defaultProps} />);
    mockEditorInstance!.storage = {
      characterCount: {
        words: vi.fn().mockReturnValue(12),
      },
    };
    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });
    unmountSave();

    // 6. wordCount === 1 "word" fallback
    const { unmount: unmountWord } = render(<TiptapEditor {...defaultProps} />);
    mockEditorInstance!.storage = {
      characterCount: {
        words: vi.fn().mockReturnValue(1),
      },
    };
    act(() => {
      capturedOnUpdate!({ editor: mockEditorInstance! });
    });
    expect(screen.getByText("1 word")).toBeInTheDocument();
    unmountWord();
  });

  it("handles null editor branches", () => {
    returnNullEditor = true;
    const ref = createRef<TiptapEditorRef>();
    const { unmount } = render(<TiptapEditor {...defaultProps} ref={ref} />);

    // setContent on null editor
    act(() => {
      ref.current?.setContent("<p>test</p>");
    });

    // Ctrl+S keydown when editor is null
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "s" }));
    });
    unmount();

    // seedOffline when editor is null
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { unmount: unmountNull } = render(<TiptapEditor {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    unmountNull();

    returnNullEditor = false;
  });

  it("handles empty / start of document AI context, response with no reader, empty chunk, and non-Error failures", async () => {
    vi.useRealTimers();
    const { unmount } = render(<TiptapEditor {...defaultProps} />);

    const fetchSpy = vi.spyOn(global, "fetch");

    // Open AI assistant menu
    const aiBtn = screen.getByText("✨ AI Copilot");
    fireEvent.click(aiBtn);

    // Empty/Start of document AI context
    mockEditorInstance!.getText.mockReturnValueOnce("");
    mockEditorInstance!.state.selection = { from: 0, to: 0 };
    mockEditorInstance!.state.doc.textBetween.mockImplementation(() => "");

    // Mock response with no reader
    const mockResponseNoReader = {
      ok: true,
      body: null,
    };
    fetchSpy.mockResolvedValueOnce(mockResponseNoReader as unknown as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("Generate ✨"));
    });

    expect(fetchSpy).toHaveBeenCalled();

    // Mock response with empty chunk and two parts
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("Part1 ") })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("") })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("Part2") })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const mockResponseChunks = {
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    };
    fetchSpy.mockResolvedValueOnce(mockResponseChunks as unknown as Response);

    // Click generate and click twice concurrently to test isGenerating early return
    await act(async () => {
      fireEvent.click(screen.getByText("Generate ✨"));
      fireEvent.click(screen.getByText("Generate ✨"));
    });

    // Wait for the generation to complete and the AI panel to close
    await waitFor(() => {
      expect(screen.queryByText("AI Copilot")).not.toBeInTheDocument();
    });

    // Re-open AI menu
    fireEvent.click(screen.getByText("✨ AI Copilot"));

    fetchSpy.mockRejectedValueOnce("String error rejection");
    await act(async () => {
      fireEvent.click(screen.getByText("Generate ✨"));
    });

    expect(toastError).toHaveBeenCalledWith("AI generation failed");

    // Test response not ok with empty response json message
    const mockResponseErrNoMsg = {
      ok: false,
      json: vi.fn().mockResolvedValueOnce({}),
    };
    fetchSpy.mockResolvedValueOnce(mockResponseErrNoMsg as unknown as Response);
    await act(async () => {
      fireEvent.click(screen.getByText("Generate ✨"));
    });

    expect(toastError).toHaveBeenCalledWith("Failed to generate AI response");

    unmount();
  });

  it("handles offline syncing sync callback branches", () => {
    const { unmount } = render(<TiptapEditor {...defaultProps} />);

    // Call handleSync with synced = false
    act(() => {
      mockProviderInstance.listeners["sync"]?.forEach((cb: (synced: boolean) => void) => cb(false));
    });

    // Call handleSync with synced = true twice
    act(() => {
      mockProviderInstance.listeners["sync"]?.forEach((cb: (synced: boolean) => void) => cb(true));
      mockProviderInstance.listeners["sync"]?.forEach((cb: (synced: boolean) => void) => cb(true));
    });

    unmount();
  });
});
