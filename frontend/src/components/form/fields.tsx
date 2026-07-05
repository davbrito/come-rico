import { useFieldContext } from "#/components/form/context";
import { Input, type InputProps } from "#/components/ui/Input";
import { Select, type SelectProps } from "#/components/ui/Select";

function fieldErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

export interface TextFieldProps extends Omit<InputProps, "value" | "onChange" | "onBlur" | "name"> {
  label: string;
}

export function TextField({ label, ...props }: TextFieldProps) {
  const field = useFieldContext<string>();
  const errors = field.state.meta.errors;
  const errorId = `${field.name}-error`;

  return (
    <div className="space-y-1">
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        placeholder={label}
        aria-label={label}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length > 0 ? errorId : undefined}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        {...props}
      />
      {field.state.meta.isValidating ? (
        <p className="text-xs text-[var(--sea-ink-soft)]">Verificando…</p>
      ) : errors.length > 0 ? (
        <p id={errorId} role="alert" className="text-xs text-red-500">
          {fieldErrorMessage(errors[0])}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps<T extends string> extends Omit<
  SelectProps<T>,
  "value" | "onValueChange"
> {
  label: string;
}

export function SelectField<T extends string>({ label, ...props }: SelectFieldProps<T>) {
  const field = useFieldContext<T>();
  return (
    <Select
      {...props}
      value={field.state.value}
      onValueChange={(value) => field.handleChange(value)}
      placeholder={label}
    />
  );
}
