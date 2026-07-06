import { Combobox } from "@base-ui/react/combobox";
import { cn } from "cnfast";
import { Check } from "lucide-react";
import { useState } from "react";

export interface TagsInputProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

export function TagsInput({
  value,
  onValueChange,
  suggestions,
  placeholder,
  className,
}: TagsInputProps) {
  const [inputValue, setInputValue] = useState("");

  const commitInput = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const exists = value.some((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (!exists) onValueChange([...value, trimmed]);
    setInputValue("");
  };

  return (
    <Combobox.Root
      multiple
      items={suggestions}
      value={value}
      onValueChange={onValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <Combobox.InputGroup>
        <Combobox.Chips
          className={cn(
            "flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-chip-bg px-2 py-1.5 focus-within:border-orange-400",
            className,
          )}
        >
          <Combobox.Value>
            {(chips: string[]) => (
              <>
                {chips.map((tag) => (
                  <Combobox.Chip
                    key={tag}
                    aria-label={tag}
                    className="flex items-center gap-1 rounded-full border border-chip-line bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                  >
                    #{tag}
                    <Combobox.ChipRemove
                      aria-label={`Quitar ${tag}`}
                      className="text-orange-700/70 hover:text-orange-700 dark:text-orange-300/70 dark:hover:text-orange-300"
                    >
                      ✕
                    </Combobox.ChipRemove>
                  </Combobox.Chip>
                ))}
                <Combobox.Input
                  placeholder={chips.length === 0 ? placeholder : undefined}
                  className="min-w-24s flex-1 bg-transparent py-0.5 text-sm text-sea-ink outline-none placeholder:text-sea-ink-soft"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventBaseUIHandler?.();
                      event.preventDefault();
                      commitInput();
                    }
                  }}
                />
              </>
            )}
          </Combobox.Value>
        </Combobox.Chips>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner className="outline-none" sideOffset={4}>
          <Combobox.Popup className="island-shell max-h-64 w-(--anchor-width) scrollbar-thin overflow-y-auto rounded-xl p-1">
            <Combobox.Empty>
              <div className="px-3 py-2 text-xs text-sea-ink-soft">Sin coincidencias</div>
            </Combobox.Empty>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-1.5 rounded-lg py-1.5 pr-3 pl-1.5 text-sm text-sea-ink select-none data-highlighted:bg-orange-100 dark:data-highlighted:bg-orange-900/30"
                >
                  <Combobox.ItemIndicator className="col-start-1 flex text-orange-500">
                    <Check className="h-3.5 w-3.5" />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2">#{item}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
