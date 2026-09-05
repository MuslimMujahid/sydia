import { createFileRoute } from "@tanstack/react-router";
import {
  ClosingBand,
  ColorSystemSection,
  CommonComponentsSection,
  HeroBand,
  PrimitivesSection,
  ShapeSection,
  SpacingSection,
  TypographySection,
} from "@/components/design-system";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Sydia Design System" },
      {
        name: "description",
        content:
          "Colors, typography, spacing, shape, and components for the Sydia personal AI assistant platform.",
      },
    ],
  }),
  component: DesignSystemPage,
});

function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-surface-1/30">
      <HeroBand />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
        <ColorSystemSection />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <TypographySection />
          <div className="space-y-6">
            <SpacingSection />
            <ShapeSection />
          </div>
        </div>
        <PrimitivesSection />
        <CommonComponentsSection />
        <ClosingBand />
      </main>
    </div>
  );
}
