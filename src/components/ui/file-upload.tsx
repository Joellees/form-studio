"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type Props = {
  onFile: (file: File) => void | Promise<void>;
  accept?: string;
  disabled?: boolean;
  label?: string;
  hint?: string;
  fileName?: string | null;
};

/**
 * Styled wrapper around `<input type="file">`. Hides the default control
 * (which renders a browser-specific "Choose file" blob) and exposes a
 * proper button plus a status line showing the picked file.
 */
export function FileUpload({
  onFile,
  accept,
  disabled,
  label = "Upload file",
  hint,
  fileName,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {fileName ? (
        <span className="max-w-xs truncate text-xs text-[color:var(--color-moss-deep)]">{fileName}</span>
      ) : hint ? (
        <span className="text-xs text-[color:var(--color-stone)]">{hint}</span>
      ) : null}
    </div>
  );
}
