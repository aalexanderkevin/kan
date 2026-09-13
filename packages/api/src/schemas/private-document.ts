import { z } from "zod";

export const EMPTY_DOCUMENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

const mark = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z.object({ type: z.literal("strike") }).strict(),
  z.object({ type: z.literal("code") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: z
            .string()
            .url()
            .max(2048)
            .refine((href) => /^https?:\/\//i.test(href)),
          target: z.literal("_blank").nullable().optional(),
          rel: z
            .string()
            .max(100)
            .refine((value) => {
              const tokens = value.split(/\s+/);
              return (
                tokens.includes("noopener") &&
                tokens.includes("noreferrer") &&
                !tokens.includes("opener")
              );
            })
            .optional(),
          class: z.null().optional(),
        })
        .strict(),
    })
    .strict(),
]);
const nodeSchema = z
  .object({
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "hardBreak",
      "horizontalRule",
    ]),
    content: z.array(z.unknown()).optional(),
    text: z.string().optional(),
    attrs: z.record(z.unknown()).optional(),
    marks: z.array(mark).max(5).optional(),
  })
  .strict();
const noAttributes = z.object({}).strict();
const attributes = {
  heading: z.object({ level: z.number().int().min(1).max(3) }).strict(),
  orderedList: z
    .object({
      start: z.number().int().min(1).max(1000000),
      type: z.enum(["1", "a", "A", "i", "I"]).nullable().optional(),
    })
    .strict(),
  codeBlock: z
    .object({
      language: z
        .string()
        .max(40)
        .regex(/^[a-zA-Z0-9_+-]*$/)
        .nullable()
        .optional(),
    })
    .strict(),
};
const blocks = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);

// Accept only the editor's data model: no HTML, embedded scripts, images, or
// arbitrary node attributes. Bound depth and node count before rendering.
export const privateDocumentContent = z
  .string()
  .max(200000)
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid document content",
      });
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      invalid();
      return;
    }
    const pending: { value: unknown; parent: string | null; depth: number }[] =
      [{ value: parsed, parent: null, depth: 0 }];
    let count = 0;
    while (pending.length) {
      const entry = pending.pop();
      if (!entry) break;
      const result = nodeSchema.safeParse(entry.value);
      if (!result.success || entry.depth > 30 || ++count > 10000) {
        invalid();
        return;
      }
      const node = result.data;
      if (entry.parent === null ? node.type !== "doc" : node.type === "doc") {
        invalid();
        return;
      }
      const attrSchema =
        node.type === "heading"
          ? attributes.heading
          : node.type === "orderedList"
            ? attributes.orderedList
            : node.type === "codeBlock"
              ? attributes.codeBlock
              : noAttributes;
      if (!attrSchema.safeParse(node.attrs ?? {}).success) {
        invalid();
        return;
      }
      if (
        node.type === "text"
          ? !node.text || !!node.content
          : node.text !== undefined
      ) {
        invalid();
        return;
      }
      if (node.marks?.length && node.type !== "text") {
        invalid();
        return;
      }
      if (
        ["text", "hardBreak", "horizontalRule"].includes(node.type) &&
        node.content
      ) {
        invalid();
        return;
      }
      const parent = entry.parent;
      if (
        ((parent === "doc" || parent === "blockquote") &&
          !blocks.has(node.type)) ||
        ((parent === "bulletList" || parent === "orderedList") &&
          node.type !== "listItem") ||
        (parent === "listItem" && !blocks.has(node.type)) ||
        ((parent === "paragraph" || parent === "heading") &&
          node.type !== "text" &&
          node.type !== "hardBreak") ||
        (parent === "codeBlock" &&
          (node.type !== "text" || !!node.marks?.length))
      ) {
        invalid();
        return;
      }
      if (
        ["doc", "blockquote", "listItem", "bulletList", "orderedList"].includes(
          node.type,
        ) &&
        !node.content?.length
      ) {
        invalid();
        return;
      }
      if (node.type === "listItem") {
        const first = nodeSchema.safeParse(node.content?.[0]);
        if (!first.success || first.data.type !== "paragraph") {
          invalid();
          return;
        }
      }
      for (const child of node.content ?? [])
        pending.push({
          value: child,
          parent: node.type,
          depth: entry.depth + 1,
        });
    }
  });
