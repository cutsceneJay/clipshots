import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlock } from "@/server/gate";

export const Route = createFileRoute("/unlock")({ component: Unlock });

function Unlock() {
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState(false);
  const nav = useNavigate();
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await unlock({ data: { password: pw } });
          if (r.ok) nav({ to: "/" });
          else setWrong(true);
        }}
      >
        <Logo />
        <p className="text-sm text-muted-foreground">Clipshots is in private beta. Enter the access password.</p>
        <Input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setWrong(false); }} placeholder="Password" autoFocus />
        {wrong && <p className="text-sm text-destructive">That password isn't right.</p>}
        <Button className="w-full" type="submit">Continue</Button>
      </form>
    </div>
  );
}
