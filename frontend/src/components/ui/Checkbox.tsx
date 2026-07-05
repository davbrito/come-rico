import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { cn } from "cnfast";
import { Check } from "lucide-react";

export function Checkbox({ className, ...props }: BaseCheckbox.Root.Props) {
  return (
    <BaseCheckbox.Root
      {...props}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] transition outline-none focus-visible:border-orange-400 data-[checked]:border-orange-500 data-[checked]:bg-orange-500",
        className as string,
      )}
    >
      <BaseCheckbox.Indicator className="flex text-white data-[unchecked]:hidden">
        <Check className="h-3.5 w-3.5" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
