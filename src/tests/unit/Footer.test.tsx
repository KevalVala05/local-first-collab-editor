import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer Component", () => {
  it("renders building info and social links correctly", () => {
    const { container } = render(<Footer className="custom-class" />);

    // Check custom className is applied
    const footerElement = container.querySelector("footer");
    expect(footerElement).not.toBeNull();
    expect(footerElement?.className).toContain("custom-class");

    // Check developer name is present
    expect(screen.getByText("Keval Vala")).not.toBeNull();

    // Check GitHub link attributes
    const githubLink = screen.getByRole("link", { name: /Keval Vala on GitHub/i });
    expect(githubLink).not.toBeNull();
    expect(githubLink.getAttribute("href")).toBe("https://github.com/KevalVala05");
    expect(githubLink.getAttribute("target")).toBe("_blank");

    // Check LinkedIn link attributes
    const linkedinLink = screen.getByRole("link", { name: /Keval Vala on LinkedIn/i });
    expect(linkedinLink).not.toBeNull();
    expect(linkedinLink.getAttribute("href")).toBe("https://www.linkedin.com/in/keval-vala-268695243");
    expect(linkedinLink.getAttribute("target")).toBe("_blank");
  });
});
