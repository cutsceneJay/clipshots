import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";

const PAGES: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms of use",
    body: [
      "Clipshots is provided by Cutscene Creative. By using it you agree to these terms.",
      "You must have the right to record, process and share any broadcast or video you bring into Clipshots, including permission from the rights holder, tournament organizer or league where required.",
      "You keep ownership of your footage and clips. You give us permission to store and process them only to run the service for you and the people you invite.",
      "Reporting illegal content: if you believe content stored in Clipshots is illegal or infringes your rights, email info@cutscenecreative.com with the link or description, your contact details and the reason. We review every report, may remove the content, and may suspend accounts that break the law or these terms.",
      "Clipshots is provided as is. We aren't liable for missed moments, lost footage or indirect losses. These terms may change; we'll post updates here.",
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      "We store your account email, the events and matches you create, the clips you catch, and who you invite.",
      "To label moments, a handful of still frames from each caught moment are sent to our AI provider. Full recordings stay on your computer unless you choose to upload clips.",
      "We don't sell your data or show ads. You can ask us to delete your account and data at any time: info@cutscenecreative.com.",
    ],
  },
  licensing: {
    title: "Licensing",
    body: [
      "Broadcast footage belongs to its rights holders. Clipshots doesn't grant any rights to footage you process.",
      "Clipshots uses open-source software including FFmpeg (LGPL/GPL) and yt-dlp (Unlicense). Their licenses are included with the desktop app.",
    ],
  },
  contact: { title: "Contact", body: ["Cutscene Creative", "info@cutscenecreative.com"] },
};

export const Route = createFileRoute("/legal/$page")({
  loader: ({ params }) => {
    const p = PAGES[params.page];
    if (!p) throw notFound();
    return p;
  },
  component: Legal,
});

function Legal() {
  const p = Route.useLoaderData();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-3xl px-4 py-5"><Link to="/"><Logo /></Link></header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-3xl font-bold">{p.title}</h1>
        {p.body.map((b, i) => <p key={i} className="text-muted-foreground">{b}</p>)}
      </main>
      <Footer />
    </div>
  );
}
