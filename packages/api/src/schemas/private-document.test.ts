import { describe, expect, it } from "vitest";

import { EMPTY_DOCUMENT, privateDocumentContent } from "./private-document";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });
describe("private document content validation", () => {
  it("accepts empty documents, lists, code and safe rich-text links", () => {
    expect(privateDocumentContent.safeParse(EMPTY_DOCUMENT).success).toBe(true);
    expect(
      privateDocumentContent.safeParse(
        doc([
          {
            type: "orderedList",
            attrs: { start: 1 },
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item" }],
                  },
                ],
              },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: null },
            content: [{ type: "text", text: "<script>plain text</script>" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Link",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://example.com",
                      target: "_blank",
                      rel: "noopener noreferrer",
                      class: null,
                    },
                  },
                ],
              },
            ],
          },
        ]),
      ).success,
    ).toBe(true);
  });
  it("rejects executable nodes, attributes, unsafe links and malformed document structure", () => {
    for (const value of [
      "<script>alert(1)</script>",
      "null",
      "{}",
      doc([]),
      doc([{ type: "iframe", attrs: { src: "https://example.com" } }]),
      doc([{ type: "paragraph", attrs: { onclick: "alert(1)" } }]),
      doc([{ type: "text", text: "Invalid top-level text" }]),
      doc([
        {
          type: "paragraph",
          content: [{ type: "heading", attrs: { level: 1 } }],
        },
      ]),
      doc([{ type: "heading", attrs: { level: 7 } }]),
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ]),
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "data:text/html,test" } }],
            },
          ],
        },
      ]),
    ])
      expect(privateDocumentContent.safeParse(value).success).toBe(false);
  });
  it("bounds document size and nesting", () => {
    expect(privateDocumentContent.safeParse(" ".repeat(200001)).success).toBe(
      false,
    );
    let nested: unknown = { type: "paragraph" };
    for (let i = 0; i < 35; i++)
      nested = { type: "blockquote", content: [nested] };
    expect(privateDocumentContent.safeParse(doc([nested])).success).toBe(false);
  });
});
