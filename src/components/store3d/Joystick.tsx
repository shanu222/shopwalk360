import React, { useRef, useState } from 'react';

/** Simple on-screen touch joystick. Reports x (right +) and y (down +) in −1..1. */
export const Joystick: React.FC<{ onChange: (x: number, y: number) => void }> = ({ onChange }) => {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 46;

  const move = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / R;
    const ny = dy / R;
    onChange(Math.abs(nx) < 0.12 ? 0 : nx, Math.abs(ny) < 0.12 ? 0 : ny);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={base}
      role="application"
      aria-label="Movement joystick. Drag to walk."
      className="pointer-events-auto relative h-32 w-32 touch-none select-none rounded-full border border-white/25 bg-black/35 backdrop-blur-md"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current === e.pointerId && move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute inset-0 m-auto h-14 w-14 rounded-full border border-white/40 bg-white/25 shadow-lg" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
};
