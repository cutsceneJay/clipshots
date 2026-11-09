import { describe, it, expect } from "vitest";
import { handleRpc, TOOLS } from "../mcp";

// A tiny stand-in for a user-scoped Supabase client that records queries.
function fakeSb(rows: unknown[]) {
  const calls: string[] = [];
  const q: any = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k === "then") return (res: any) => res({ data: rows, error: null });
        return (...a: unknown[]) => {
          calls.push(`${k}(${JSON.stringify(a)})`);
          return k === "maybeSingle" || k === "single" ? Promise.resolve({ data: rows[0] ?? null, error: null }) : q;
        };
      },
    },
  );
  return { sb: { from: (t: string) => (calls.push(`from(${t})`), q) } as any, calls };
}

describe("MCP server", () => {
  it("initializes and lists tools", async () => {
    const { sb } = fakeSb([]);
    expect(((await handleRpc(sb, { jsonrpc: "2.0", id: 1, method: "initialize" })) as any).result).toMatchObject({ serverInfo: { name: "clipshots" } });
    const list: any = await handleRpc(sb, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });
  it("runs tools through the user's client", async () => {
    const { sb, calls } = fakeSb([{ id: "e1", name: "Masters" }]);
    const r: any = await handleRpc(sb, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_events", arguments: {} } });
    expect(calls[0]).toBe("from(events)");
    expect(r.result.content[0].text).toContain("Masters");
  });
  it("rejects unknown methods and tools", async () => {
    const { sb } = fakeSb([]);
    expect(((await handleRpc(sb, { id: 4, method: "nope" })) as any).error.code).toBe(-32601);
    expect(((await handleRpc(sb, { id: 5, method: "tools/call", params: { name: "drop_db" } })) as any).error.code).toBe(-32602);
  });
});
