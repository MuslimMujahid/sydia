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
      { title: "Sistem Desain Sydia" },
      {
        name: "description",
        content:
          "Warna, tipografi, spasi, bentuk, dan komponen untuk platform asisten AI pribadi Sydia.",
      },
    ],
  }),
  component: DesignSystemPage,
});

function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      <HeroBand />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-12 lg:px-8 lg:py-24">
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
