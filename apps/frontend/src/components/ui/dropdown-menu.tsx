import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@/lib/utils/cn";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;

type DropdownMenuContentProps = MenuPrimitive.Popup.Props & {
  side?: MenuPrimitive.Positioner.Props["side"];
  align?: MenuPrimitive.Positioner.Props["align"];
};

function DropdownMenuContent({
  className,
  side = "bottom",
  align = "start",
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={6}
        className="z-50"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-44 space-y-0.5 rounded-md border border-ink/6 bg-canvas p-1.5 text-ink shadow-card transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

type DropdownMenuItemProps = MenuPrimitive.Item.Props & {
  destructive?: boolean;
};

function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2.5 py-2 font-sans text-sm text-ink-muted outline-none select-none data-[highlighted]:bg-surface-1 data-[highlighted]:text-ink [&_svg]:size-4 [&_svg]:shrink-0",
        destructive &&
          "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
        className
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
export type { DropdownMenuContentProps, DropdownMenuItemProps };
