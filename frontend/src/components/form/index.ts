import { createFormHook } from "@tanstack/react-form";

import { fieldContext, formContext } from "#/components/form/context";
import { SelectField, TextField } from "#/components/form/fields";
import { SubmitButton } from "#/components/form/form-components";

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField },
  formComponents: { SubmitButton },
});

export { useFieldContext, useFormContext } from "#/components/form/context";
