// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { parseMarkdown } from "./parseMarkdown";

describe("parseMarkdown", () => {
  it("converts **bold** to <strong>", () => {
    expect(parseMarkdown("hello **world**")).toBe("hello <strong>world</strong>");
  });

  it("converts *italic* to <em>", () => {
    expect(parseMarkdown("hello *world*")).toBe("hello <em>world</em>");
  });

  it("converts `code` to <code>", () => {
    expect(parseMarkdown("use `list_topics`")).toBe("use <code>list_topics</code>");
  });

  it("converts ```code blocks``` to <pre><code>", () => {
    expect(parseMarkdown("```\nfoo\nbar\n```")).toBe("<pre><code>foo\nbar</code></pre>");
  });

  it("converts newlines to <br>", () => {
    expect(parseMarkdown("line1\nline2")).toBe("line1<br>line2");
  });

  it("handles mixed formatting", () => {
    const input = "I found **2 topics**: `sick1/image` and `plc/virtmaster`";
    const result = parseMarkdown(input);
    expect(result).toContain("<strong>2 topics</strong>");
    expect(result).toContain("<code>sick1/image</code>");
  });

  it("escapes HTML entities to prevent XSS", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
    expect(parseMarkdown("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("renders a markdown table as an HTML table", () => {
    const input = [
      "| Name | Value |",
      "|------|-------|",
      "| foo  | 1     |",
      "| bar  | 2     |",
    ].join("\n");

    const result = parseMarkdown(input);
    expect(result).toContain("<table>");
    expect(result).toContain("<th>");
    expect(result).toContain("Name");
    expect(result).toContain("<td>");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("renders a table with surrounding text", () => {
    const input = [
      "Here are the results:",
      "",
      "| Peak | Time |",
      "|------|------|",
      "| 1    | 10s  |",
      "",
      "Done.",
    ].join("\n");

    const result = parseMarkdown(input);
    expect(result).toContain("Here are the results:");
    expect(result).toContain("<table>");
    expect(result).toContain("Peak");
    expect(result).toContain("10s");
    expect(result).toContain("Done.");
  });

  it("converts unordered list items to HTML list", () => {
    const input = "Options:\n- item one\n- item two\n- item three";
    const result = parseMarkdown(input);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("item one");
  });
});
