import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * DOM targets inside the dashboard shell's mobile app bar. Pages portal their
 * title and search into these so the app bar reflects the current page.
 */
export type TopbarSlots = {
  title: HTMLElement | null;
  search: HTMLElement | null;
};

export const TopbarSlotsContext = createContext<TopbarSlots>({
  title: null,
  search: null,
});

type TopbarPortalProps = {
  slot: keyof TopbarSlots;
  children: ReactNode;
};

/** Renders children into a slot of the mobile app bar, if the shell has one. */
export function TopbarPortal({ slot, children }: TopbarPortalProps) {
  const target = useContext(TopbarSlotsContext)[slot];

  return target ? createPortal(children, target) : null;
}

type TopbarTitleProps = {
  children: ReactNode;
  /**
   * Render the title as the page's `h1`. Pages that already own a visible
   * heading on phones (such as the daily note's date) pass `false`.
   */
  heading?: boolean;
};

/** The page title shown in the mobile app bar in place of the brand name. */
export function TopbarTitle({ children, heading = true }: TopbarTitleProps) {
  const Tag = heading ? "h1" : "p";

  return (
    <TopbarPortal slot="title">
      <Tag className="truncate font-display text-base font-semibold">
        {children}
      </Tag>
    </TopbarPortal>
  );
}
