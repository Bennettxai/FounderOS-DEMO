'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { AudioLines, Mic, Plus, Send, X } from 'lucide-react';
import { COMPOSER_MAX_PX, composerHeight } from '@/lib/composer';

/**
 * The Claude-style composer, shared by every Conductor surface (the operator, *: "give the conductor text bar the same capabilities... do the * same thing with the conductor board"). Multiline (Enter sends, Shift+Enter
 * breaks), (+) attaches a text file whose contents ride into the message
 * honestly labeled, a live model chip when the caller knows the seat's model,
 * mic dictation via the browser SpeechRecognition API, and a wave button that
 * reads the last reply aloud. Every control is functional, none are
 * decoration.
 *
 * onSend(message, display): `message` is the full outbound body (attachment
 * included), `display` is what the caller should show as the user bubble.
 */
export function ConductorComposer({
  onSend,
  disabled = false,
  model = null,
  placeholder = 'Message the CEO…',
  lastReply = null,
  onError,
}: {
  onSend: (message: string, display: string) => void | Promise<void>;
  disabled?: boolean;
  model?: string | null;
  placeholder?: string;
  /** the latest assistant text, for the read-aloud button */
  lastReply?: string | null;
  onError?: (message: string) => void;
}) {
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  /**
   * Grow the box to the text that is actually in it.
   *
   * Height is reset to 'auto' before reading scrollHeight on purpose: an
   * already-tall textarea keeps reporting its old scrollHeight after the text
   * shrinks, so without the reset the composer could only ever get taller and
   * would stay huge after sending.
   */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${composerHeight(el.scrollHeight)}px`;
  }, [input, attachment]);

  const dictationBaseRef = useRef('');

  function send() {
    const text = input.trim();
    if (!text || disabled) return;
    // an attached text file rides inside the message body, honestly labeled
    const message = attachment ? `${text}\n\n[Attached: ${attachment.name}]\n${attachment.text}` : text;
    setInput('');
    setAttachment(null);
    void onSend(message, text);
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = (await file.text()).slice(0, 8000);
      setAttachment({ name: file.name, text });
    } catch {
      onError?.(`Could not read ${file.name}`);
    }
  }

  // Dictation via the browser's speech recognition — real, no key needed.
  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      onError?.('Voice input is not available in this browser.');
      return;
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rec: any = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    dictationBaseRef.current = input;
    rec.onresult = (e: any) => {
      let heard = '';
      for (const r of e.results) heard += r[0].transcript;
      setInput((dictationBaseRef.current ? `${dictationBaseRef.current} ` : '') + heard);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  // Read the latest reply aloud (toggle) — the wave button.
  function toggleSpeak() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!lastReply || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(lastReply);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <div
      data-lens="r"
      className="pressable is-row rounded-panel border border-os-border bg-os-bg px-3 pb-2 pt-2.5 focus-within:border-os-border-strong"
    >
      <textarea
        ref={boxRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={1}
        style={{ maxHeight: COMPOSER_MAX_PX }}
        placeholder={placeholder}
        className="w-full resize-none overflow-y-auto bg-transparent text-xs leading-relaxed text-os-text placeholder:text-os-dim focus:outline-none"
      />
      {attachment && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full border border-os-border bg-os-surface2 px-2 py-0.5 font-mono text-[9.5px] text-os-muted">
            {attachment.name}
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="pressable text-os-dim hover:text-os-text">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.json,.log"
          className="hidden"
          onChange={(e) => void attachFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach a text file — its contents ride into the message"
          data-lens="c"
          className="pressable is-dark rounded-full p-1.5 text-os-dim"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="hidden font-mono text-[9px] text-os-dim sm:inline">
          Enter sends · Shift+Enter breaks
        </span>
        {model && (
          <span className="ml-auto mr-1 font-mono text-[10px] text-os-dim" title="the model holding the Conductor seat right now">
            {model}
          </span>
        )}
        <button
          onClick={toggleMic}
          title={listening ? 'Stop dictation' : 'Dictate with your voice'}
          data-lens="c"
          className={`pressable rounded-full p-1.5 ${listening ? 'text-os-err' : 'is-dark text-os-dim'} ${model ? '' : 'ml-auto'}`}
        >
          <Mic className={`h-3.5 w-3.5 ${listening ? 'animate-pulse' : ''}`} />
        </button>
        <button
          onClick={toggleSpeak}
          title={speaking ? 'Stop reading' : 'Read the last reply aloud'}
          data-lens="c"
          className={`pressable rounded-full p-1.5 ${speaking ? 'text-os-accent' : 'is-dark text-os-dim'}`}
        >
          <AudioLines className={`h-3.5 w-3.5 ${speaking ? 'animate-pulse' : ''}`} />
        </button>
        <button
          onClick={send}
          disabled={disabled || !input.trim()}
          aria-label="Send"
          data-lens="c"
          className="pressable is-dark rounded-full border border-os-border-strong bg-os-surface2 p-1.5 text-os-text disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
