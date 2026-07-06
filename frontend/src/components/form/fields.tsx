import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

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

export interface PasswordFieldProps extends Omit<
  InputProps,
  "value" | "onChange" | "onBlur" | "name" | "type"
> {
  label: string;
}

export function PasswordField({ label, className, ...props }: PasswordFieldProps) {
  const field = useFieldContext<string>();
  const errors = field.state.meta.errors;
  const errorId = `${field.name}-error`;
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-1">
      <div className="relative">
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
          type={showPassword ? "text" : "password"}
          className={`pr-10 ${className ?? ""}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--sea-ink-soft)]"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
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
