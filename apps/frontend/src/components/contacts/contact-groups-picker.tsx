import { Checkbox } from "@/components/ui/checkbox";
import type { ContactGroup } from "@/lib/services/api/contact-groups/contact-groups.api";

type ContactGroupsPickerProps = {
  groups: ContactGroup[];
  selected: string[];
  loading: boolean;
  onChange: (value: string[]) => void;
};

export function ContactGroupsPicker({
  groups,
  selected,
  loading,
  onChange,
}: ContactGroupsPickerProps) {
  return (
    <fieldset className="space-y-3" aria-busy={loading}>
      <legend className="font-display text-sm font-semibold text-ink">
        Grup
      </legend>
      {loading ? (
        <p className="text-xs text-ink-muted">Memuat grup…</p>
      ) : groups.length ? (
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const checked = selected.includes(group.id);
            const checkboxId = `contact-group-${group.id}`;

            return (
              <label
                key={group.id}
                htmlFor={checkboxId}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-surface-1 bg-canvas px-3 py-2 text-sm"
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    onChange(
                      nextChecked
                        ? [...selected, group.id]
                        : selected.filter((id) => id !== group.id)
                    )
                  }
                />
                {group.name}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Belum ada grup. Buat grup di tab Grup.
        </p>
      )}
    </fieldset>
  );
}
