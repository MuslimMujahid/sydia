import { ArrowRight, Sparkle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Divider } from "@/components/ui/divider";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ShowcaseSection, Specimen } from "./section";

function PrimitivesSection() {
  return (
    <ShowcaseSection
      number="05"
      title="Primitive Components"
      tagline="Foundational building blocks."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Specimen
          title="Surface / Container"
          description="Base surface for sections and content."
        >
          <div className="h-16 rounded-md border border-surface-1 bg-surface-1/70" />
        </Specimen>

        <Specimen
          title="Card (Light)"
          description="A clean card for everyday content."
        >
          <Card variant="light" className="h-16 p-4" />
        </Specimen>

        <Specimen
          title="Card (Dark)"
          description="Editorial surface for emphasis."
        >
          <Card variant="dark" className="p-4">
            <p className="font-display text-base font-semibold">Sydia</p>
            <p className="font-sans text-sm text-canvas/70">
              Smarter together.
            </p>
          </Card>
        </Specimen>

        <Specimen
          title="Eyebrow / Label Chip"
          description="Uppercase label for context."
        >
          <div>
            <Eyebrow variant="chip">Feature</Eyebrow>
          </div>
        </Specimen>

        <Specimen title="Pill Badge" description="Status or categorical badge.">
          <div>
            <Badge dot="brand">Active</Badge>
          </div>
        </Specimen>

        <Specimen
          title="Icon Container"
          description="Holds icons at a consistent size and rhythm."
        >
          <div className="flex size-12 items-center justify-center rounded-md border border-surface-1 bg-surface-1/70 text-ink">
            <Sparkle className="size-5" />
          </div>
        </Specimen>

        <Specimen
          title="Divider"
          description="Subtle dividers for content structure."
        >
          <Divider className="my-auto" />
        </Specimen>

        <Specimen
          title="Avatar / Presence Dot"
          description="User avatar with presence indicator."
        >
          <Avatar initials="S" presence />
        </Specimen>

        <Specimen
          title="Code Block"
          description="For code, prompts, and technical content."
        >
          <CodeBlock code={"const sydia =\n  new Assistant();"} />
        </Specimen>

        <Specimen
          title="Section Header Row"
          description="A consistent header pattern for sections."
        >
          <div className="flex items-baseline justify-between">
            <p className="font-display text-lg font-bold text-ink">
              Section Title
            </p>
            <a
              href="/design-system"
              className="inline-flex items-center gap-1 font-sans text-sm text-link hover:underline"
            >
              View all <ArrowRight className="size-3.5" />
            </a>
          </div>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}

export { PrimitivesSection };
