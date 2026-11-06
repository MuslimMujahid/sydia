import { expect, type Locator } from "@playwright/test";

/** Opens a dropdown-based `SelectField` and picks the option with `label`. */
export async function chooseOption(trigger: Locator, label: string) {
  await trigger.click();
  await trigger
    .page()
    .getByRole("menuitemradio", { name: label, exact: true })
    .click();
}

/** Asserts the option labels of a dropdown-based `SelectField`, then closes it. */
export async function expectOptions(trigger: Locator, labels: string[]) {
  await trigger.click();
  await expect(trigger.page().getByRole("menuitemradio")).toHaveText(labels);
  await trigger.page().keyboard.press("Escape");
}
