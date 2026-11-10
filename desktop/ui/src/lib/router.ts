// A tiny hash router: #/ , #/match/<id>, #/settings
import { useEffect, useState } from "react";

export type Route = { page: "home" } | { page: "match"; id: string } | { page: "settings" };

export function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const m = /^\/match\/([\w-]+)$/.exec(h);
  if (m) return { page: "match", id: m[1] };
  if (h === "/settings") return { page: "settings" };
  return { page: "home" };
}

export function go(path: string) {
  location.hash = path;
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setR(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
