import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <div className="flex min-h-screen items-center justify-center"><main><p className="text-3xl font-bold underline">Welcome to TanStack Start</p><Button>Home</Button></main></div>;
}
