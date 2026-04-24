"use client";

import { useState } from "react";

import { RequestSessionDialog } from "./request-session-dialog";
import { Button } from "@/components/ui/button";

export function RequestSessionButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>request a session</Button>
      {open ? <RequestSessionDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
