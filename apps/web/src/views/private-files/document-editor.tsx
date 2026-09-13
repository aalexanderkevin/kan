import type { JSONContent } from "@tiptap/react";
import { t } from "@lingui/core/macro";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

export default function DocumentEditor({
  content,
  onChange,
  readOnly,
}: {
  content: string;
  onChange: (content: string) => void;
  readOnly: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        openOnClick: true,
        validate: (href) => /^https?:\/\//i.test(href),
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content: JSON.parse(content) as JSONContent,
    editable: !readOnly,
    onUpdate: ({ editor }) =>
      onChangeRef.current(JSON.stringify(editor.getJSON())),
    editorProps: {
      attributes: {
        class: "min-h-[420px] outline-none",
        "aria-label": t`Document content`,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== content)
      editor.commands.setContent(JSON.parse(content) as JSONContent, false);
  }, [content, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  if (!editor)
    return <p className="p-6 text-sm" role="status">{t`Loading document…`}</p>;
  const actions = [
    {
      label: t`Bold`,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t`Italic`,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t`Heading`,
      active: editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: t`Subheading`,
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: t`Bullet list`,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: t`Numbered list`,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t`Quote`,
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: t`Code block`,
      active: editor.isActive("codeBlock"),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-light-300 dark:border-dark-300">
      {!readOnly && (
        <div
          className="flex flex-wrap gap-1 border-b border-light-300 bg-light-100 p-2 dark:border-dark-300 dark:bg-dark-100"
          role="toolbar"
          aria-label={t`Formatting`}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              aria-pressed={action.active}
              onClick={action.run}
              className={`rounded px-2 py-1.5 text-xs hover:bg-light-300 focus-visible:outline focus-visible:outline-2 dark:hover:bg-dark-300 ${action.active ? "bg-light-300 font-semibold dark:bg-dark-300" : ""}`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="rounded px-2 py-1.5 text-xs disabled:opacity-40"
          >{t`Undo`}</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="rounded px-2 py-1.5 text-xs disabled:opacity-40"
          >{t`Redo`}</button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none break-words p-5 sm:p-8 [&_a]:text-blue-600 [&_pre]:overflow-x-auto"
      />
    </div>
  );
}
