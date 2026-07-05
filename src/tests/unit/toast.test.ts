import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "react-toastify";
import { toastSuccess, toastSucess, toastError } from "@/lib/toast";

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("toast helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toastSuccess uses custom toastId if provided", () => {
    toastSuccess("Saved!", { toastId: "custom-id" });
    expect(toast.success).toHaveBeenCalledWith("Saved!", {
      toastId: "custom-id",
    });
  });

  it("toastSuccess generates toastId from message if not provided", () => {
    toastSuccess("Doc Saved Successfully!");
    expect(toast.success).toHaveBeenCalledWith("Doc Saved Successfully!", {
      toastId: "success-doc-saved-successfully-",
    });
  });

  it("toastSucess alias functions identically to toastSuccess", () => {
    toastSucess("Alias Works");
    expect(toast.success).toHaveBeenCalledWith("Alias Works", {
      toastId: "success-alias-works",
    });
  });

  it("toastError uses custom toastId if provided", () => {
    toastError("Failed!", { toastId: "err-custom-id" });
    expect(toast.error).toHaveBeenCalledWith("Failed!", {
      toastId: "err-custom-id",
    });
  });

  it("toastError generates toastId from message if not provided", () => {
    toastError("Network Error 404!");
    expect(toast.error).toHaveBeenCalledWith("Network Error 404!", {
      toastId: "error-network-error-404-",
    });
  });
});
