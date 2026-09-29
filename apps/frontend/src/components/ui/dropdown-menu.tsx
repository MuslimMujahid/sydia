import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuSubmenu = MenuPrimitive.SubmenuRoot;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

type DropdownMenuContentProps = MenuPrimitive.Popup.Props & {
  side?: MenuPrimitive.Positioner.Props["side"];
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  collisionAvoidance?: MenuPrimitive.Positioner.Props["collisionAvoidance"];
};

function DropdownMenuContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  collisionAvoidance,
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionAvoidance={collisionAvoidance}
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

const dropdownMenuItemClassName =
  "flex cursor-default items-center gap-2 rounded-sm px-2.5 py-2 font-sans text-sm text-ink-muted outline-none select-none data-[highlighted]:bg-surface-1 data-[highlighted]:text-ink [&_svg]:size-4 [&_svg]:shrink-0";

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
        dropdownMenuItemClassName,
        destructive &&
          "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
        className
      )}
      {...props}
    />
  );
}

type DropdownMenuRadioItemProps = MenuPrimitive.RadioItem.Props;

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        dropdownMenuItemClassName,
        "data-[checked]:text-ink",
        className
      )}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="ml-auto" aria-hidden="true">
        <Check />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

type DropdownMenuSubmenuTriggerProps = MenuPrimitive.SubmenuTrigger.Props;

function DropdownMenuSubmenuTrigger({
  className,
  children,
  ...props
}: DropdownMenuSubmenuTriggerProps) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-submenu-trigger"
      className={cn(
        dropdownMenuItemClassName,
        "data-[popup-open]:bg-surface-1 data-[popup-open]:text-ink",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden="true" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
};
export type {
  DropdownMenuContentProps,
  DropdownMenuItemProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSubmenuTriggerProps,
};
