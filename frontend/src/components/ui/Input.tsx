import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "cnfast";

const sizeClasses = {
  sm: "rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-xs",
  md: "rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm",
};

export interface InputProps extends Omit<BaseInput.Props, "size"> {
  size?: keyof typeof sizeClasses;
}

export function Input({ size = "md", className, ...props }: InputProps) {
  return (
    <BaseInput
      {...props}
      className={cn(
        "w-full text-[var(--sea-ink)] outline-none focus:border-orange-400",
        sizeClasses[size],
        className as string,
      )}
    />
  );
}
