import {
  ButtonSpecimen,
  CheckboxSpecimen,
  DatePickerSpecimen,
  FileUploadSpecimen,
  RadioSpecimen,
  SelectSpecimen,
  SwitchSpecimen,
  TextareaSpecimen,
  TextInputSpecimen,
} from "./form-specimens";
import {
  AlertSpecimen,
  ConfirmDialogSpecimen,
  DropdownSpecimen,
  LoadingSpecimen,
  ModalSpecimen,
  PaginationSpecimen,
  TabsSpecimen,
  ToastSpecimen,
} from "./feedback-specimens";
import { ShowcaseSection } from "./section";

function CommonComponentsSection() {
  return (
    <ShowcaseSection
      number="06"
      title="Komponen Umum"
      tagline="Bangun lebih cepat. Tetap konsisten."
    >
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ButtonSpecimen />
        <TextInputSpecimen />
        <TextareaSpecimen />
        <SelectSpecimen />
        <CheckboxSpecimen />
        <RadioSpecimen />
        <SwitchSpecimen />
        <DatePickerSpecimen />
        <FileUploadSpecimen />
        <TabsSpecimen />
        <PaginationSpecimen />
        <DropdownSpecimen />
        <ToastSpecimen />
        <AlertSpecimen />
        <ModalSpecimen />
        <ConfirmDialogSpecimen />
        <LoadingSpecimen />
      </div>
    </ShowcaseSection>
  );
}

export { CommonComponentsSection };
