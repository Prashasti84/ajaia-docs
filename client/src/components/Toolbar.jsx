import { useRef } from 'react';
import { useEditorState } from '@tiptap/react';
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '../api.js';

const I = {
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  bullet: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  ordered: 'M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M3.5 9h3M3.5 14.5c.5-1 2.5-1 2.5.5 0 1-2.5 2-2.5 3.5h3',
  quote: 'M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6',
  file: 'M12 18v-7M9 14l3-3 3 3M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
};

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Btn({ label, shortcut, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className={`tool${active ? ' active' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export default function Toolbar({ editor, onInsertFile, inserting }) {
  const fileInput = useRef(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const setBlock = (value) => {
    if (value === 'p') chain().setParagraph().run();
    else chain().toggleHeading({ level: Number(value[1]) }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Icon d={I.undo} />
      </Btn>
      <Btn label="Redo" shortcut={`${mod}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Icon d={I.redo} />
      </Btn>
      <span className="tool-sep" />
      <select
        className="tool-select"
        aria-label="Text style"
        value={s.block}
        onChange={(e) => setBlock(e.target.value)}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="tool-sep" />
      <Btn label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
      </Btn>
      <Btn label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn label="Strikethrough" shortcut={`${mod}Shift+S`} active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <span className="tool-sep" />
      <Btn label="Bulleted list" shortcut={`${mod}Shift+8`} active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <Icon d={I.bullet} />
      </Btn>
      <Btn label="Numbered list" shortcut={`${mod}Shift+7`} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <Icon d={I.ordered} />
      </Btn>
      <Btn label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Icon d={I.quote} />
      </Btn>
      <span className="tool-sep" />
      <Btn
        label={`Insert content from a file (${UPLOAD_HINT})`}
        disabled={inserting}
        onClick={() => fileInput.current?.click()}
      >
        <Icon d={I.file} />
        <span className="tool-text">{inserting ? 'Inserting…' : 'Insert file'}</span>
      </Btn>
      <input
        ref={fileInput}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onInsertFile(file);
        }}
      />
    </div>
  );
}
