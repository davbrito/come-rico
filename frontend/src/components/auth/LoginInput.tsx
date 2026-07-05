import { cn } from "cnfast";

export function LoginInput(props: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400",
        props.className,
      )}
    />
  );
}
