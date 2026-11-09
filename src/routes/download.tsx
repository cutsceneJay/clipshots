import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/download")({ component: DownloadPage });
const url = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined;

function DownloadPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-4xl px-4 py-5"><Link to="/"><Logo /></Link></header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10">
        <h1 className="text-3xl font-bold">Clipshots for Windows and Mac</h1>
        <p className="text-muted-foreground">Install it on the computer that has the broadcast feed. It watches the stream, cuts each big moment into an MP4 and, when you're signed in, sends it to your team's live board.</p>
        {url ? (
          <Button asChild size="lg"><a href={url}>Download the latest version</a></Button>
        ) : (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">Download links will appear here once the first desktop build is published.</p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Windows 10 or 11 (installer or portable)</li>
          <li>macOS 12 or later, Apple Silicon or Intel</li>
          <li>Recording in OBS? Set the format to MKV so Clipshots can read it while it records.</li>
        </ul>
      </main>
      <Footer />
    </div>
  );
}
