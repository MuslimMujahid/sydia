import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Specimen } from "./section";

function TabsSpecimen() {
  return (
    <Specimen number="10" title="Tabs" description="Organize related content.">
      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTab value="chat">Chat</TabsTab>
          <TabsTab value="knowledge">Knowledge</TabsTab>
          <TabsTab value="settings">Settings</TabsTab>
        </TabsList>
        <TabsPanel value="chat">
          <div className="rounded-md bg-surface-1/50 p-4">
            <p className="font-display text-lg font-bold text-ink">
              Start a conversation
            </p>
            <p className="font-sans text-sm leading-[21px] text-ink-muted">
              Ask Sydia anything, from quick questions to complex projects.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel value="knowledge">
          <p className="font-sans text-sm leading-[21px] text-ink-muted">
            Your saved sources and memories live here.
          </p>
        </TabsPanel>
        <TabsPanel value="settings">
          <p className="font-sans text-sm leading-[21px] text-ink-muted">
            Tune Sydia to the way you work.
          </p>
        </TabsPanel>
      </Tabs>
    </Specimen>
  );
}

const PAGES = [1, 2, 3, 4];

function PaginationSpecimen() {
  return (
    <Specimen
      number="11"
      title="Pagination"
      description="Navigate through content."
    >
      <nav
        aria-label="Pagination"
        className="flex items-center justify-center gap-1"
      >
        <button
          type="button"
          aria-label="Previous page"
          className="rounded-sm p-2 text-ink-weak hover:bg-surface-1"
        >
          <ChevronLeft className="size-4" />
        </button>
        {PAGES.map((page) => (
          <button
            key={page}
            type="button"
            aria-current={page === 1 ? "page" : undefined}
            className={`size-8 rounded-sm font-sans text-sm ${
              page === 1
                ? "bg-brand font-semibold text-ink"
                : "text-ink-soft hover:bg-surface-1"
            }`}
          >
            {page}
          </button>
        ))}
        <span className="px-1 font-sans text-sm text-ink-weak">…</span>
        <button
          type="button"
          className="size-8 rounded-sm border border-hairline font-sans text-sm text-ink-soft hover:bg-surface-1"
        >
          10
        </button>
        <button
          type="button"
          aria-label="Next page"
          className="rounded-sm p-2 text-ink-weak hover:bg-surface-1"
        >
          <ChevronRight className="size-4" />
        </button>
      </nav>
      <p className="text-center font-sans text-sm text-ink-muted">
        Showing 1–10 of 94 results
      </p>
    </Specimen>
  );
}

function DropdownSpecimen() {
  return (
    <Specimen
      number="12"
      title="Dropdown Menu"
      description="Contextual actions."
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="secondary" size="sm">
              <MoreVertical />
              More actions
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Share2 /> Share
          </DropdownMenuItem>
          <DropdownMenuItem destructive>
            <Trash2 /> Delete
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Archive /> Move to archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Specimen>
  );
}

type ToastItem = {
  title: string;
  body: string;
  icon: "success" | "info" | "warn";
  dark?: boolean;
};

const TOASTS: ToastItem[] = [
  {
    title: "New memory added",
    body: "Sydia will remember this.",
    icon: "success",
    dark: true,
  },
  {
    title: "Report generated",
    body: "Your report is ready to view.",
    icon: "info",
  },
  {
    title: "You're offline",
    body: "Some features may be limited.",
    icon: "warn",
  },
];

const toastIconClasses: Record<ToastItem["icon"], string> = {
  success: "bg-brand text-ink",
  info: "bg-link text-canvas",
  warn: "bg-warn text-canvas",
};

const toastIcon = { success: CheckCircle2, info: Info, warn: AlertTriangle };

function ToastSpecimen() {
  return (
    <Specimen
      number="13"
      title="Toast"
      description="Brief, temporary feedback."
    >
      <div className="space-y-2">
        {TOASTS.map((toast) => {
          const Icon = toastIcon[toast.icon];

          return (
            <div
              key={toast.title}
              role="status"
              className={`flex items-start gap-3 rounded-md border p-3 ${
                toast.dark
                  ? "border-editorial bg-editorial text-canvas"
                  : "border-surface-1 bg-canvas text-ink"
              }`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${toastIconClasses[toast.icon]}`}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="flex-1">
                <p className="font-sans text-sm font-medium">{toast.title}</p>
                <p
                  className={`font-sans text-xs ${toast.dark ? "text-canvas/70" : "text-ink-muted"}`}
                >
                  {toast.body}
                </p>
              </div>
              <X
                className={`size-3.5 ${toast.dark ? "text-canvas/60" : "text-ink-weak"}`}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </Specimen>
  );
}

type AlertItem = {
  title: string;
  body: string;
  tone: "info" | "warn" | "error";
};

const ALERTS: AlertItem[] = [
  {
    title: "Heads up",
    body: "Sydia is constantly improving. Check out what's new.",
    tone: "info",
  },
  {
    title: "Action required",
    body: "Please verify your email address to continue.",
    tone: "warn",
  },
  {
    title: "Something went wrong",
    body: "We couldn't process your request. Please try again.",
    tone: "error",
  },
];

const alertToneClasses: Record<AlertItem["tone"], string> = {
  info: "border-link/30 bg-link/5 text-link",
  warn: "border-warn/40 bg-warn/10 text-warn",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

const alertIcon = { info: Info, warn: AlertTriangle, error: X };

function AlertSpecimen() {
  return (
    <Specimen
      number="14"
      title="Alert"
      description="Important, persistent messages."
    >
      <div className="space-y-2">
        {ALERTS.map((alert) => {
          const Icon = alertIcon[alert.tone];

          return (
            <div
              key={alert.title}
              role="alert"
              className={`flex items-start gap-3 rounded-md border p-3 ${alertToneClasses[alert.tone]}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p className="font-sans text-sm font-medium">{alert.title}</p>
                <p className="font-sans text-xs text-ink-soft">{alert.body}</p>
              </div>
              <X className="size-3.5 text-ink-weak" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </Specimen>
  );
}

function ModalSpecimen() {
  return (
    <Specimen
      number="15"
      title="Modal"
      description="Focused tasks or workflows."
    >
      <Dialog>
        <DialogTrigger
          render={<Button variant="dark">Create a new project</Button>}
        />
        <DialogContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <DialogTitle>Create a new project</DialogTitle>
              <DialogDescription>
                Turn your ideas into action with Sydia.
              </DialogDescription>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="project-name"
                className="font-sans text-sm text-ink-soft"
              >
                Project name
              </label>
              <Input id="project-name" placeholder="e.g. Q2 Planning" />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose
                render={
                  <Button variant="secondary" size="sm">
                    Cancel
                  </Button>
                }
              />
              <DialogClose
                render={
                  <Button variant="primary" size="sm">
                    Create
                  </Button>
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Specimen>
  );
}

function ConfirmDialogSpecimen() {
  return (
    <Specimen
      number="16"
      title="Dialog"
      description="Confirmation or critical decisions."
    >
      <Dialog>
        <DialogTrigger
          render={
            <Button variant="destructive" size="sm">
              Delete this item?
            </Button>
          }
        />
        <DialogContent className="text-center">
          <div className="space-y-4">
            <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="size-4 text-destructive" />
            </span>
            <div className="space-y-1">
              <DialogTitle>Delete this item?</DialogTitle>
              <DialogDescription>
                This action cannot be undone.
              </DialogDescription>
            </div>
            <div className="flex justify-center gap-2">
              <DialogClose
                render={
                  <Button variant="secondary" size="sm">
                    Cancel
                  </Button>
                }
              />
              <DialogClose
                render={
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Specimen>
  );
}

function LoadingSpecimen() {
  return (
    <Specimen
      number="17"
      title="Loading Indicator"
      description="Show progress and activity."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Loader2
            className="size-6 animate-spin text-brand-deep"
            aria-hidden="true"
          />
          <span className="font-sans text-sm text-ink-muted">Loading…</span>
          <span className="sr-only" role="status">
            Loading
          </span>
        </div>
        <div
          className="flex items-center gap-2"
          role="status"
          aria-label="Thinking"
        >
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2 animate-pulse rounded-full bg-brand-deep" />
            <span className="size-2 animate-pulse rounded-full bg-brand-deep [animation-delay:150ms]" />
            <span className="size-2 animate-pulse rounded-full bg-brand-deep [animation-delay:300ms]" />
          </span>
          <span className="font-sans text-sm text-ink-muted">Thinking…</span>
        </div>
        <div>
          <div
            role="progressbar"
            aria-valuenow={68}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Generating response"
            className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-1"
          >
            <div className="h-full w-[68%] rounded-pill bg-brand" />
          </div>
          <div className="mt-1 flex justify-between font-sans text-xs text-ink-muted">
            <span>Generating response…</span>
            <span>68%</span>
          </div>
        </div>
      </div>
    </Specimen>
  );
}

export {
  TabsSpecimen,
  PaginationSpecimen,
  DropdownSpecimen,
  ToastSpecimen,
  AlertSpecimen,
  ModalSpecimen,
  ConfirmDialogSpecimen,
  LoadingSpecimen,
};
