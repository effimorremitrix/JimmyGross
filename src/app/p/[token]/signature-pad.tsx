"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface SignaturePadHandle {
  /** PNG data URL, or null when nothing has been drawn/typed. */
  toPng(): string | null;
  clear(): void;
}

/**
 * Finger/mouse/stylus signature, with a typed-name fallback for patients who
 * cannot draw (motor impairment, screen reader, no touch screen).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange(hasInk: boolean): void; fullName: string }>(
  function SignaturePad({ onChange, fullName }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const strokes = useRef(0);
    const [mode, setMode] = useState<"draw" | "type">("draw");
    const [typed, setTyped] = useState("");

    const setup = useCallback(() => {
      const c = canvas.current;
      if (!c) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "#12233a";
      strokes.current = 0;
      onChange(false);
    }, [onChange]);

    useEffect(() => {
      setup();
    }, [setup, mode]);

    useEffect(() => {
      if (mode !== "type") return;
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const { width, height } = c.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      if (typed.trim()) {
        ctx.fillStyle = "#12233a";
        ctx.font = "italic 34px 'Brush Script MT', 'Segoe Script', cursive";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typed.trim(), width / 2, height / 2, width - 24);
      }
      onChange(typed.trim().length >= 3);
    }, [typed, mode, onChange]);

    function point(e: React.PointerEvent<HTMLCanvasElement>) {
      const r = canvas.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function down(e: React.PointerEvent<HTMLCanvasElement>) {
      if (mode !== "draw") return;
      e.preventDefault();
      canvas.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point(e);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current || !last.current) return;
      const p = point(e);
      const ctx = canvas.current!.getContext("2d")!;
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }

    function up() {
      if (!drawing.current) return;
      drawing.current = false;
      last.current = null;
      strokes.current += 1;
      onChange(true);
    }

    useImperativeHandle(ref, () => ({
      toPng() {
        if (mode === "draw" && strokes.current === 0) return null;
        if (mode === "type" && typed.trim().length < 3) return null;
        return canvas.current?.toDataURL("image/png") ?? null;
      },
      clear() {
        setTyped("");
        setup();
      },
    }));

    return (
      <div className="flex flex-col gap-2">
        <canvas
          ref={canvas}
          role="img"
          aria-label={mode === "draw" ? "Zone de signature : signez avec le doigt ou la souris" : "Aperçu de votre signature tapée"}
          className="h-44 w-full touch-none rounded-2xl border-2 border-dashed border-line-strong bg-white"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {mode === "type" && (
          <label className="flex flex-col gap-1 text-[14px] font-semibold">
            Tapez vos prénom et nom
            <input
              className="h-12 rounded-xl border border-line-strong bg-white px-3 text-[16px] font-normal"
              value={typed}
              placeholder={fullName}
              autoComplete="name"
              onChange={(e) => setTyped(e.target.value.slice(0, 60))}
            />
          </label>
        )}
        <div className="flex flex-wrap gap-x-5">
          <button type="button" className="min-h-11 text-[14px] font-medium text-brand underline-offset-2 hover:underline" onClick={() => (mode === "draw" ? setup() : setTyped(""))}>
            Effacer
          </button>
          <button
            type="button"
            className="min-h-11 text-[14px] font-medium text-brand underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "draw" ? "type" : "draw")}
          >
            {mode === "draw" ? "Je préfère taper mon nom" : "Signer avec le doigt"}
          </button>
        </div>
      </div>
    );
  },
);
