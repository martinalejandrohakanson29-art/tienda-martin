"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface DecimalInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  [key: string]: any;
}

export function DecimalInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  autoFocus,
  onKeyDown,
  ...props
}: DecimalInputProps) {
  const [display, setDisplay] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    const isTypingDecimal = display.endsWith(".") || display.endsWith(",");
    const current = parseFloat(display.replace(",", "."));
    if (!isTypingDecimal && current !== value) {
      setDisplay(value === 0 ? "" : String(value));
    }
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={display}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={className}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
        setDisplay(raw);
        const parsed = parseFloat(raw.replace(",", "."));
        if (!isNaN(parsed)) onChange(parsed);
        else if (raw === "" || raw === "-") onChange(0);
      }}
      onBlur={() => {
        const parsed = parseFloat(display.replace(",", "."));
        setDisplay(isNaN(parsed) || parsed === 0 ? "" : String(parsed));
      }}
    />
  );
}
