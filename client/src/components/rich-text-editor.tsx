import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading3,
  Heading4,
  Highlighter,
  ImageIcon,
  Undo,
  Redo,
  RemoveFormatting,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  "data-testid"?: string;
}

export function RichTextEditor({ value, onChange, placeholder, "data-testid": testId }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[80px] p-3 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
  }, [value]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setHighlight = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("highlight")) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border rounded-md overflow-hidden" data-testid={testId}>
      <div className="flex flex-wrap gap-0.5 p-1 border-b bg-muted/30">
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          data-testid="rte-bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          data-testid="rte-italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={addLink}
          title="Add Link"
          data-testid="rte-link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
          data-testid="rte-h3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("heading", { level: 4 }) ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          title="Heading 4"
          data-testid="rte-h4"
        >
          <Heading4 className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
          data-testid="rte-bullet-list"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered List"
          data-testid="rte-ordered-list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
          data-testid="rte-blockquote"
        >
          <Quote className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive({ textAlign: "left" }) ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align Left"
          data-testid="rte-align-left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive({ textAlign: "center" }) ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align Center"
          data-testid="rte-align-center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive({ textAlign: "right" }) ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align Right"
          data-testid="rte-align-right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("highlight") ? "secondary" : "ghost"}
          className="h-7 w-7"
          onClick={setHighlight}
          title="Highlight"
          data-testid="rte-highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={addImage}
          title="Insert Image"
          data-testid="rte-image"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Clear Formatting"
          data-testid="rte-clear"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
          data-testid="rte-undo"
        >
          <Undo className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
          data-testid="rte-redo"
        >
          <Redo className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextRenderer({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-blue-600 [&_a]:underline [&_mark]:bg-yellow-200 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic"
      dangerouslySetInnerHTML={{ __html: content }}
      data-testid="rich-text-content"
    />
  );
}
