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
      title="Komponen Primitif"
      tagline="Blok pembangun yang mendasar."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Specimen
          title="Permukaan / Kontainer"
          description="Permukaan dasar untuk bagian dan konten."
        >
          <div className="h-16 rounded-md border border-surface-1 bg-surface-1/70" />
        </Specimen>

        <Specimen
          title="Kartu (Terang)"
          description="Kartu bersih untuk konten sehari-hari."
        >
          <Card variant="light" className="h-16 p-4" />
        </Specimen>

        <Specimen
          title="Kartu (Gelap)"
          description="Permukaan editorial untuk penekanan."
        >
          <Card variant="dark" className="p-4">
            <p className="font-display text-base font-semibold">Sydia</p>
            <p className="font-sans text-sm text-canvas/70">
              Lebih cerdas bersama.
            </p>
          </Card>
        </Specimen>

        <Specimen
          title="Alis / Chip Label"
          description="Label huruf besar untuk konteks."
        >
          <div>
            <Eyebrow variant="chip">Fitur</Eyebrow>
          </div>
        </Specimen>

        <Specimen
          title="Lencana Pil"
          description="Lencana status atau kategori."
        >
          <div>
            <Badge dot="brand">Aktif</Badge>
          </div>
        </Specimen>

        <Specimen
          title="Kontainer Ikon"
          description="Menampung ikon dengan ukuran dan ritme konsisten."
        >
          <div className="flex size-12 items-center justify-center rounded-md border border-surface-1 bg-surface-1/70 text-ink">
            <Sparkle className="size-5" />
          </div>
        </Specimen>

        <Specimen
          title="Pemisah"
          description="Pemisah halus untuk struktur konten."
        >
          <Divider className="my-auto" />
        </Specimen>

        <Specimen
          title="Avatar / Titik Kehadiran"
          description="Avatar pengguna dengan indikator kehadiran."
        >
          <Avatar initials="S" presence />
        </Specimen>

        <Specimen
          title="Blok Kode"
          description="Untuk kode, prompt, dan konten teknis."
        >
          <CodeBlock code={"const sydia =\n  new Assistant();"} />
        </Specimen>

        <Specimen
          title="Baris Header Bagian"
          description="Pola header konsisten untuk berbagai bagian."
        >
          <div className="flex items-baseline justify-between">
            <p className="font-display text-lg font-bold text-ink">
              Judul Bagian
            </p>
            <a
              href="/design-system"
              className="inline-flex items-center gap-1 font-sans text-sm text-link hover:underline"
            >
              Lihat semua <ArrowRight className="size-3.5" />
            </a>
          </div>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}

export { PrimitivesSection };
