"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { createTemplate } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = { name: string; day_label: string; description: string };

export function NewTemplateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>();

  function onSubmit(values: Values) {
    startTransition(async () => {
      const result = await createTemplate(values);
      if (!result.ok) {
        setError("name", { message: result.error });
        return;
      }
      router.push(`/studio/templates/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>name</Label>
        <Input {...register("name", { required: "Required" })} placeholder="Lower A · strength" />
        {errors.name ? <p className="text-xs text-[color:var(--color-sienna)]">{errors.name.message}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label>day label (optional)</Label>
        <Input {...register("day_label")} placeholder="Monday, Day 1, etc." />
      </div>
      <div className="flex flex-col gap-2">
        <Label>description</Label>
        <Textarea {...register("description")} placeholder="What this session is for." rows={3} />
      </div>
      <div className="pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "creating…" : "create and build"}
        </Button>
      </div>
    </form>
  );
}
