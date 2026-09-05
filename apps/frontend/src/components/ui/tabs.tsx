import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils/cn";

type TabsProps = TabsPrimitive.Root.Props;

function Tabs({ className, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("w-full", className)}
      {...props}
    />
  );
}

type TabsListProps = TabsPrimitive.List.Props;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex items-center gap-6 border-b border-hairline",
        className
      )}
      {...props}
    />
  );
}

type TabsTabProps = TabsPrimitive.Tab.Props;

function TabsTab({ className, ...props }: TabsTabProps) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "-mb-px border-b-2 border-transparent pb-2 font-sans text-base text-ink-muted transition-colors outline-none hover:text-ink data-[active]:border-brand data-[active]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[focused]:ring-3 data-[focused]:ring-brand/40",
        className
      )}
      {...props}
    />
  );
}

type TabsPanelProps = TabsPrimitive.Panel.Props;

function TabsPanel({ className, ...props }: TabsPanelProps) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("pt-4 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
export type { TabsProps, TabsListProps, TabsTabProps, TabsPanelProps };
