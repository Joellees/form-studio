export default function StudioLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-sm text-[color:var(--color-stone)]">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-moss)] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[color:var(--color-moss)]" />
        </span>
        setting up your studio
      </div>
    </div>
  );
}
