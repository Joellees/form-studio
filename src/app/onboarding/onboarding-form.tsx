"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { completeOnboarding, type OnboardingResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/lib/env";

type FormValues = {
  slug: string;
  displayName: string;
  bio: string;
  timezone: string;
};

export function OnboardingForm({ initialSlug, initialName }: { initialSlug: string; initialName: string }) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      slug: initialSlug,
      displayName: initialName,
      bio: "",
      timezone: typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
    },
  });

  const rootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN;

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result: OnboardingResult = await completeOnboarding(values);
      if (!result.ok) {
        setError(result.field ?? "slug", { message: result.error });
        return;
      }
      // Redirect to the tenant subdomain
      window.location.href = `${window.location.protocol}//${values.slug}.${rootDomain}/studio/dashboard`;
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6 rise-in">
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">your address</Label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-[color:var(--color-stone-soft)] focus-within:border-[color:var(--color-moss)]">
          <Input
            id="slug"
            {...register("slug", { required: "Pick a subdomain to continue" })}
            className="border-0 text-sm focus-visible:border-0"
            placeholder="joelle"
            aria-describedby="slug-hint"
          />
          <span className="flex items-center border-l border-[color:var(--color-stone-soft)] bg-[color:var(--color-parchment)] px-3 text-sm text-[color:var(--color-stone)]">
            .{rootDomain.replace(/:\d+$/, "")}
          </span>
        </div>
        <p id="slug-hint" className="text-xs text-[color:var(--color-stone)]">
          Lowercase, letters, numbers, dashes. 3&ndash;32 characters.
        </p>
        {errors.slug ? <p className="text-xs text-[color:var(--color-sienna)]">{errors.slug.message}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">display name</Label>
        <Input id="displayName" {...register("displayName", { required: "Tell clients who you are" })} placeholder="Joelle" />
        {errors.displayName ? <p className="text-xs text-[color:var(--color-sienna)]">{errors.displayName.message}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">short bio</Label>
        <Textarea
          id="bio"
          {...register("bio")}
          placeholder="Two sentences about how you train and who you train."
          rows={3}
        />
      </div>

      <input type="hidden" {...register("timezone")} />

      <div className="pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "creating your studio…" : "open my studio"}
        </Button>
      </div>
    </form>
  );
}
