import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "cnfast";
import { Check, ChevronDown } from "lucide-react";

export interface SelectProps<T> {
  items: ReadonlyArray<{ label: string; value: T }>;
  value?: T | null;
  onValueChange: (value: T) => void;
  placeholder?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

const triggerSizeClasses = {
  sm: "rounded-lg bg-transparent px-2 py-1.5 text-xs",
  md: "rounded-xl bg-[var(--chip-bg)] px-3 py-2.5 text-sm",
};

export function Select<T>({
  items,
  value,
  onValueChange,
  placeholder,
  className,
  size = "md",
}: SelectProps<T>) {
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next != null) onValueChange(next as T);
      }}
    >
      <BaseSelect.Trigger
        className={cn(
          "flex items-center justify-between gap-1 border border-[var(--line)] text-[var(--sea-ink)] outline-none focus-visible:border-orange-400 data-[popup-open]:border-orange-400",
          triggerSizeClasses[size],
          className,
        )}
      >
        <BaseSelect.Value placeholder={placeholder} className="truncate" />
        <BaseSelect.Icon className="flex shrink-0 text-[var(--sea-ink-soft)]">
          <ChevronDown className="h-3.5 w-3.5" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-50 outline-none" sideOffset={4}>
          <BaseSelect.Popup className="island-shell max-h-64 overflow-y-auto rounded-xl p-1">
            <BaseSelect.List>
              {items.map((item) => (
                <BaseSelect.Item
                  key={String(item.value)}
                  value={item.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-1.5 rounded-lg py-1.5 pr-3 pl-1.5 text-sm text-[var(--sea-ink)] select-none data-[highlighted]:bg-orange-100 dark:data-[highlighted]:bg-orange-900/30"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 flex text-orange-500">
                    <Check className="h-3.5 w-3.5" />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{item.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
