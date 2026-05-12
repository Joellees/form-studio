"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { completeOnboarding, type OnboardingResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveSlugFromName } from "@/lib/slug";
import { getDisplayDomain } from "@/lib/urls";

type FormValues = {
  studioName: string;
  bio: string;
  timezone: string;
};

export function OnboardingForm({ initialName }: { initialName: string }) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      studioName: initialName,
      bio: "",
      timezone:
        typeof window !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "UTC",
    },
  });

  // Live previews — both derived from the same source of truth the server
  // will use, so what the trainer sees is what gets stored.
  const studioName = watch("studioName") ?? "";
  const derivedSlug = deriveSlugFromName(studioName);
  const displayDomain = getDisplayDomain();

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result: OnboardingResult = await completeOnboarding({
        studioName: values.studioName,
        bio: values.bio,
        timezone: values.timezone,
      });
      if (!result.ok) {
        setError(result.field ?? "studioName", { message: result.error });
        return;
      }
      // Same-origin path-based redirect. The previous subdomain-style
      // target (`{slug}.form-studio.app`) hit NXDOMAIN because there's
      // no wildcard DNS — trainers were stuck on "site can't be reached"
      // right after a successful onboarding.
      window.location.href = "/studio/dashboard";
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-10 flex flex-col gap-6 rise-in"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="studioName">your studio name</Label>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Input
            id="studioName"
            {...register("studioName", { required: "Pick a name to continue" })}
            placeholder="Joelle"
            aria-describedby="studio-name-hint"
            autoFocus
            inputMode="text"
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            className="max-w-[18rem]"
          />
          <span className="text-sm text-[color:var(--color-ink)]/65">
            &rsquo;s Form Studio
          </span>
        </div>
        <p className="text-xs text-[color:var(--color-ink)]/45">
          If your name is common, add your last name to keep your URL clean.
        </p>
        <p id="studio-name-hint" className="text-xs text-[color:var(--color-stone)]">
          Your URL will be{" "}
          <span className="font-mono text-[color:var(--color-ink)]/80">
            {displayDomain}/{derivedSlug || "yourname"}
          </span>
        </p>
        {errors.studioName ? (
          <p className="text-xs text-[color:var(--color-sienna)]">
            {errors.studioName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">short bio</Label>
        <Textarea
          id="bio"
          {...register("bio", {
            maxLength: { value: 500, message: "Keep it under 500 characters." },
          })}
          placeholder="Two sentences about how you train and who you train."
          rows={3}
        />
        {errors.bio ? (
          <p className="text-xs text-[color:var(--color-sienna)]">{errors.bio.message}</p>
        ) : null}
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
