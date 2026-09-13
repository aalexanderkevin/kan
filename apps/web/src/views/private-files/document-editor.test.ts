import { getSchema } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { privateDocumentContent } from "../../../../../packages/api/src/schemas/private-document";

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
  }),
]);

describe("private Docs editor and API compatibility", () => {
  it("round-trips every supported text format through the server schema", () => {
    const document = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, schema.text("Team wiki")),
      schema.node("heading", { level: 2 }, schema.text("Notes")),
      schema.node("paragraph", null, [
        schema.text("Bold", [schema.mark("bold")]),
        schema.text("Italic", [schema.mark("italic")]),
        schema.text("Deleted", [schema.mark("strike")]),
        schema.text("Code", [schema.mark("code")]),
        schema.node("hardBreak"),
        schema.text("Link", [
          schema.mark("link", { href: "https://example.com" }),
        ]),
      ]),
      schema.node(
        "bulletList",
        null,
        schema.node(
          "listItem",
          null,
          schema.node("paragraph", null, schema.text("Item")),
        ),
      ),
      schema.node(
        "orderedList",
        { start: 2 },
        schema.node(
          "listItem",
          null,
          schema.node("paragraph", null, schema.text("Second")),
        ),
      ),
      schema.node(
        "blockquote",
        null,
        schema.node("paragraph", null, schema.text("Quote")),
      ),
      schema.node(
        "codeBlock",
        null,
        schema.text("<script>text, not executable</script>"),
      ),
      schema.node("horizontalRule"),
    ]);
    const encoded = JSON.stringify(document.toJSON());
    expect(privateDocumentContent.safeParse(encoded).success, encoded).toBe(
      true,
    );
    expect(schema.nodeFromJSON(JSON.parse(encoded)).eq(document)).toBe(true);
  });
  it("accepts a new empty editor document", () => {
    const document = schema.node("doc", null, schema.node("paragraph"));
    expect(
      privateDocumentContent.safeParse(JSON.stringify(document.toJSON()))
        .success,
    ).toBe(true);
  });
});
