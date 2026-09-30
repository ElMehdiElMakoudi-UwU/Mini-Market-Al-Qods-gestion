"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

// Touch-friendly number entry; the physical keyboard works too.
export function NumpadModal({
  title,
  initial = "",
  suffix,
  hint,
  onConfirm,
  onClose,
  children,
  confirmLabel,
  isValid = (v) => parseFloat(v.replace(",", ".")) > 0,
}: {
  title: string;
  initial?: string;
  suffix?: string;
  hint?: React.ReactNode;
  onConfirm: (value: string) => void;
  onClose: () => void;
  children?: React.ReactNode;
  confirmLabel?: string;
  isValid?: (value: string) => boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const press = (k: string) => {
    if (k === "⌫") setValue((v) => v.slice(0, -1));
    else if (k === "." && value.includes(".")) return;
    else setValue((v) => v + k);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (isValid(value)) onConfirm(value.replace(",", "."));
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="num input py-3 text-end text-3xl font-bold"
        />
        {suffix && <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted">{suffix}</span>}
      </div>
      {hint && <div className="mt-2 text-sm">{hint}</div>}
      <div className="num mt-3 grid grid-cols-3 gap-2" dir="ltr">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="rounded-lg border border-line bg-surface py-4 text-xl font-semibold active:bg-brand-100"
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary py-3" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn-primary py-3" onClick={submit} disabled={!isValid(value)}>
          {confirmLabel ?? t.common.confirm}
        </button>
      </div>
    </Modal>
  );
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className={`card max-h-[95vh] w-full overflow-y-auto p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-sm"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
