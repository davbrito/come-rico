import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cnfast";

type Variant = "primary" | "accent-outline" | "outline" | "danger" | "ghost" | "danger-ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "rounded-full bg-orange-500 font-semibold text-white hover:bg-orange-600",
  "accent-outline":
    "rounded-full border border-orange-500 font-semibold text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20",
  outline:
    "rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] font-semibold text-[var(--sea-ink)] hover:border-orange-400",
  danger:
    "rounded-full border border-red-200 font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20",
  ghost: "font-semibold text-orange-500 hover:text-orange-600",
  "danger-ghost": "text-red-400 hover:text-red-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-8 py-3 text-base",
};

const ghostSizeClasses: Record<Size, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export interface ButtonProps extends BaseButton.Props {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  const isGhost = variant === "ghost" || variant === "danger-ghost";
  return (
    <BaseButton
      {...props}
      className={cn(
        "transition disabled:opacity-60",
        variantClasses[variant],
        isGhost ? ghostSizeClasses[size] : sizeClasses[size],
        className as string,
      )}
    />
  );
}
