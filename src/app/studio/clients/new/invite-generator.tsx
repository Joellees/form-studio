"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createInvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getInviteUrl } from "@/lib/urls";

type Values = {
  displayName: string;
  email: string;
  phone: string;
  notes: string;
  packageId: string;
};

type PackageOpt = { id: string; name: string; session_count: number; price_usd: number };

export function InviteGenerator({ packages }: { packages: PackageOpt[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    inviteUrl: string;
    name: string;
    phone: string;
    packageName: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
  } = useForm<Values>({
    defaultValues: { packageId: packages[0]?.id ?? "" },
  });

  function onSubmit(values: Values) {
    startTransition(async () => {
      const r = await createInvite(values);
      if (!r.ok) {
        if (r.fieldErrors) {
          for (const [k, v] of Object.entries(r.fieldErrors)) {
            setError(k as keyof Values, { message: v[0] });
          }
        } else {
          setError("displayName", { message: r.error });
        }
        return;
      }
      // Always emit the canonical app URL via the helper — trainers
      // may be on stale preview deployments. The helper reads from
      // `NEXT_PUBLIC_APP_URL`, which resolves to form-studio.app in
      // prod, so recipients always get a working link.
      const pkg = packages.find((p) => p.id === values.packageId) ?? null;
      setResult({
        inviteUrl: getInviteUrl(r.data.code),
        name: values.displayName,
        phone: values.phone,
        packageName: pkg?.name ?? null,
      });
    });
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (result) {
    const phoneDigits = result.phone.replace(/\D/g, "");
    const message = `Hey ${result.name.split(" ")[0]} — here's your sign-up link for the studio.${result.packageName ? ` You're set up on ${result.packageName}.` : ""}\n\n${result.inviteUrl}`;
    const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;

    return (
      <div className="mt-10 flex flex-col gap-6 rise-in">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
            invite ready
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Send this to {result.name.split(" ")[0]}.
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-ink)]/70">
            Single-use link. They open it, sign up{result.packageName ? `, and land on ${result.packageName}` : ""} — pending your payment confirmation.
          </p>
        </div>

        {/* The link itself, copy-able. */}
        <div className="flex items-stretch overflow-hidden rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)]">
          <input
            readOnly
            value={result.inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent px-5 py-3 text-sm text-[color:var(--color-ink)] focus:outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="border-l border-[color:var(--color-stone-soft)] bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] transition hover:bg-[color:var(--color-moss-deep)]"
          >
            {copied ? "copied" : "copy link"}
          </button>
        </div>

        {/* Share shortcuts. WhatsApp works everywhere; the message is
            pre-filled so the trainer just hits send. */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            share now
          </p>
          <div className="flex flex-wrap gap-2">
            {phoneDigits.length > 0 ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-medium text-white hover:opacity-90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.5 3.5A11.5 11.5 0 0 0 3.6 18.1L2 22l4.1-1.6a11.5 11.5 0 0 0 17.4-9.6 11.4 11.4 0 0 0-3-7.3Zm-8.5 17.6a9.5 9.5 0 0 1-4.8-1.3l-.4-.2-2.5.9.9-2.4-.2-.4a9.5 9.5 0 1 1 6.9 3.4Zm5.5-7c-.3-.2-1.7-.9-2-1s-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a8 8 0 0 1-3.7-3.4c-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.5-.4-.6-.4h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3a10 10 0 0 0 4.2 3.7c.6.2 1 .4 1.4.5.6.2 1.1.1 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.5.2-1 .2-1.1 0-.1-.2-.2-.5-.3Z" />
                </svg>
                send via WhatsApp
              </a>
            ) : null}
            {result.phone ? (
              <a
                href={`sms:${result.phone}?&body=${encodeURIComponent(message)}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--color-ink)]/15 bg-[color:var(--color-canvas)] px-5 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
              >
                send via SMS
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
            }}
          >
            another invite
          </Button>
          <Button onClick={() => router.push("/studio/clients")}>back to clients</Button>
        </div>
      </div>
    );
  }

  // Watch the values so the submit button can hint the next step.
  const liveName = watch("displayName") ?? "";
  const livePhone = watch("phone") ?? "";
  const ready = liveName.trim().length > 0 && livePhone.trim().length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="display name" error={errors.displayName?.message}>
        <Input
          {...register("displayName", { required: "Required" })}
          placeholder="How you&rsquo;ll refer to them"
          autoComplete="off"
          autoCapitalize="words"
        />
      </Field>
      <Field label="phone" error={errors.phone?.message}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          {...register("phone", { required: "Required" })}
          placeholder="+961 70 000 000"
        />
      </Field>
      <Field label="email (optional)" error={errors.email?.message}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...register("email")}
          placeholder="name@example.com"
        />
      </Field>
      <Field label="package they&rsquo;re agreeing to">
        {packages.length === 0 ? (
          <p className="text-xs text-[color:var(--color-stone)]">
            Create a package first to attach one to the invite.
          </p>
        ) : (
          <Select {...register("packageId")}>
            <option value="">no package — they pick later</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.session_count} sessions / month · ${p.price_usd.toLocaleString()}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="private notes (optional)">
        <Textarea
          {...register("notes")}
          placeholder="Goals, injuries, anything you want to remember."
        />
      </Field>
      <div className="pt-2">
        <Button type="submit" disabled={pending || !ready} size="lg">
          {pending ? "generating…" : "generate invite link"}
        </Button>
        <p className="mt-2 text-xs text-[color:var(--color-stone)]">
          You&rsquo;ll get a copyable link + a WhatsApp share button on the next screen.
        </p>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
