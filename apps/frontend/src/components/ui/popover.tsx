import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils/cn";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = PopoverPrimitive.Popup.Props & {
  side?: PopoverPrimitive.Positioner.Props["side"];
  align?: PopoverPrimitive.Positioner.Props["align"];
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
  collisionPadding?: PopoverPrimitive.Positioner.Props["collisionPadding"];
};

function PopoverContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  collisionPadding = 12,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-80 max-w-[calc(100vw-2rem)] rounded-md border border-ink/6 bg-canvas p-4 text-ink shadow-card outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

type PopoverTitleProps = PopoverPrimitive.Title.Props;

function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn(
        "font-display text-[17px] leading-snug font-semibold text-ink",
        className
      )}
      {...props}
    />
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverClose };
export type { PopoverContentProps, PopoverTitleProps };
