import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-context";

export { useFieldContext } from "./form-context";
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
});
