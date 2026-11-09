import { HeadContent, Scripts, createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { DesktopBridge } from "@/components/DesktopBridge";
import { gateStatus } from "@/server/gate";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/unlock" || location.pathname.startsWith("/legal") || location.pathname.startsWith("/api")) return;
    const g = await gateStatus();
    if (g.required && !g.unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#09090f" },
      { title: "Clipshots · Live highlight catcher for esports" },
      { name: "description", content: "Clipshots watches your broadcast and grabs the big moments, sorted and ready, so your producer doesn't have to." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: () => (
    <>
      <Outlet />
      <DesktopBridge />
      <Toaster theme="dark" position="top-center" richColors />
    </>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
