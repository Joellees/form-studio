"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { scheduleSession } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClientOpt = {
  id: string;
  displayName: string;
  activeSubscriptionId: string | null;
  sessionsRemaining: number;
  packageName: string | null;
};

type Values = {
  clientId: string;
  scheduledAt: string;
  durationMinutes: number;
  sessionType: "in_person" | "zoom" | "in_app";
  templateId: string;
  zoomUrl: string;
  name: string;
};

export function ScheduleForm({ clients, templates }: { clients: ClientOpt[]; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    defaultValues: {
      clientId: clients[0]?.id ?? "",
      scheduledAt: defaultDateTime(),
      durationMinutes: 60,
      sessionType: "in_person",
      templateId: "",
      zoomUrl: "",
      name: "",
    },
  });

  const sessionType = watch("sessionType");

  function onSubmit(values: Values) {
    startTransition(async () => {
      const result = await scheduleSession({
        clientId: values.clientId,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
        durationMinutes: Number(values.durationMinutes),
        sessionType: values.sessionType,
        templateId: values.templateId || null,
        zoomUrl: values.zoomUrl || null,
        name: values.name || null,
      });
      if (!result.ok) {
        setError("clientId", { message: result.error });
        return;
      }
      router.push(`/studio/sessions/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>client</Label>
        <select
          {...register("clientId", { required: true })}
          className="h-10 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        >
          {clients.length === 0 ? <option value="">no clients yet</option> : null}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
              {c.activeSubscriptionId ? ` · ${c.sessionsRemaining} left` : " · no active block"}
            </option>
          ))}
        </select>
        {errors.clientId ? <p className="text-xs text-[color:var(--color-sienna)]">{errors.clientId.message}</p> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>date &amp; time</Label>
          <Input type="datetime-local" {...register("scheduledAt", { required: true })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>duration (minutes)</Label>
          <Input type="number" min={15} step={5} {...register("durationMinutes", { valueAsNumber: true, required: true })} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>session type</Label>
        <select
          {...register("sessionType")}
          className="h-10 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        >
          <option value="in_person">in person</option>
          <option value="zoom">zoom</option>
          <option value="in_app">in app</option>
        </select>
      </div>

      {sessionType === "zoom" ? (
        <div className="flex flex-col gap-2">
          <Label>zoom url</Label>
          <Input {...register("zoomUrl")} placeholder="https://zoom.us/j/…" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label>template (optional)</Label>
        <select
          {...register("templateId")}
          className="h-10 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        >
          <option value="">no template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-[color:var(--color-stone)]">
          For in-app sessions, pick a template so the client knows what to do.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>name (optional)</Label>
        <Input {...register("name")} placeholder="Week 3 · lower" />
      </div>

      <div className="pt-2">
        <Button type="submit" size="lg" disabled={pending || clients.length === 0}>
          {pending ? "scheduling…" : "schedule session"}
        </Button>
      </div>
    </form>
  );
}

function defaultDateTime(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 24);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
}
