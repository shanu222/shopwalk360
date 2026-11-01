import React, { useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { InquiryForm } from './InquiryForm';

/** Draggable help button for the 2D store. Opens the same inquiry form. */
export const HelpChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef({ active: false, moved: false, x: 0, y: 0, left: 0, top: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { active: true, moved: false, x: e.clientX, y: e.clientY, left: box.left, top: box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 6) drag.current.moved = true;
    const size = 56;
    setPos({
      left: Math.min(window.innerWidth - size - 8, Math.max(8, drag.current.left + dx)),
      top: Math.min(window.innerHeight - size - 8, Math.max(8, drag.current.top + dy)),
    });
  };
  const onPointerUp = () => {
    drag.current.active = false;
  };

  const alignRight = !pos || pos.left > window.innerWidth / 2;

  return (
    <div className="fixed z-[65]" style={pos ? { left: pos.left, top: pos.top } : { right: 20, bottom: 20 }}>
      {open && (
        <div className={`absolute bottom-16 w-[min(92vw,340px)] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl ${alignRight ? 'right-0' : 'left-0'}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold">Help</div>
              <div className="text-[11px] text-slate-500">We reply from info@shopwalk360.com</div>
            </div>
            <button type="button" aria-label="Close help" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <InquiryForm />
        </div>
      )}
      <button
        type="button"
        aria-label="Help"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (drag.current.moved) {
            drag.current.moved = false;
            return;
          }
          setOpen((v) => !v);
        }}
        className="flex h-14 w-14 touch-none items-center justify-center rounded-full bg-[#c8a96a] text-[#1a1712] shadow-lg hover:bg-[#d6b97c]"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
};
