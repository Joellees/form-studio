import { NewTemplateForm } from "./new-template-form";

export default function NewTemplatePage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">templates</p>
      <h1 className="mt-2 text-4xl">New template.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Name your session. You&rsquo;ll add exercises and set groups on the next screen.
      </p>
      <NewTemplateForm />
    </div>
  );
}
