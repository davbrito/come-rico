import { useFormContext } from "#/components/form/context";
import { Button, type ButtonProps } from "#/components/ui/Button";

export interface SubmitButtonProps extends Omit<ButtonProps, "type" | "disabled"> {
  pendingLabel?: string;
}

export function SubmitButton({ children, pendingLabel, ...props }: SubmitButtonProps) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" disabled={!canSubmit || isSubmitting} {...props}>
          {isSubmitting ? (pendingLabel ?? "Guardando…") : children}
        </Button>
      )}
    </form.Subscribe>
  );
}
