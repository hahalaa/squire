import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/api";
import { RepertoireTree } from "./RepertoireTree";
import { allNodeIds } from "./treeModel";
import type { ImportMeta, RepertoireDetail, RepertoireSummary } from "./types";

const API_URL = import.meta.env.VITE_API_URL;

// The CHESS-009 Phase 2 repertoire browser. Wired only to the real Phase 1 API
// (no mocked data): lists the user's repertoires, lets them create one and
// import/export PGN, and renders the selected repertoire's position tree in a
// collapsible browser. Every async op handles loading/error/empty explicitly;
// the API's { data, error, meta } envelope is surfaced, and an expired session
// (a 401 from the requireUser guard) shows a message rather than blanking.
export function RepertoireBrowser() {
  const api = useApi();

  const [list, setList] = useState<RepertoireSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListError(null);
    const res = await api<RepertoireSummary[]>("/api/repertoires");
    if (res.error || !res.data) {
      setListError(res.error ?? "Could not load repertoires");
      setList([]);
      return;
    }
    setList(res.data);
    // Auto-select the first repertoire so the browser isn't empty on load.
    setSelectedId((current) => current ?? res.data![0]?.id ?? null);
  }, [api]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleCreated = useCallback((rep: RepertoireSummary) => {
    setList((current) => [...(current ?? []), rep]);
    setSelectedId(rep.id);
  }, []);

  if (list === null) {
    return <ListSkeleton />;
  }

  if (listError) {
    return (
      <Centered>
        <p className="text-sm text-destructive">{listError}</p>
        <Button variant="secondary" className="mt-4" onClick={() => void loadList()}>
          Retry
        </Button>
      </Centered>
    );
  }

  // Empty state: a new user with no repertoire sees a prompt, not a blank tree.
  if (list.length === 0) {
    return (
      <Centered>
        <h2 className="font-display text-2xl text-foreground">
          Create your first repertoire
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          A repertoire is a tree of opening lines for one colour. Create one,
          then import a PGN to fill it with lines to study.
        </p>
        <div className="mt-6 w-full max-w-sm">
          <CreateRepertoireForm onCreated={handleCreated} />
        </div>
      </Centered>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[16rem_1fr]">
      <RepertoireSidebar
        list={list}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreated={handleCreated}
      />
      {selectedId ? (
        <RepertoireDetailPanel key={selectedId} id={selectedId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a repertoire to view its lines.
        </p>
      )}
    </div>
  );
}

// ---- sidebar (repertoire list + create) ----

function RepertoireSidebar({
  list,
  selectedId,
  onSelect,
  onCreated,
}: {
  list: RepertoireSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (rep: RepertoireSummary) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <aside className="flex flex-col gap-2">
      <ul className="space-y-1">
        {list.map((rep) => (
          <li key={rep.id}>
            <button
              type="button"
              onClick={() => onSelect(rep.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                rep.id === selectedId
                  ? "bg-secondary text-secondary-foreground"
                  : "hover:bg-secondary/40",
              )}
            >
              <span className="truncate">{rep.name}</span>
              <Badge variant={rep.id === selectedId ? "default" : "outline"}>
                {rep.colour}
              </Badge>
            </button>
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="rounded-md border border-border p-3">
          <CreateRepertoireForm
            onCreated={(rep) => {
              onCreated(rep);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          + New repertoire
        </Button>
      )}
    </aside>
  );
}

function CreateRepertoireForm({
  onCreated,
  onCancel,
}: {
  onCreated: (rep: RepertoireSummary) => void;
  onCancel?: () => void;
}) {
  const api = useApi();
  const [name, setName] = useState("");
  const [colour, setColour] = useState<"white" | "black">("white");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api<RepertoireSummary>("/api/repertoires", {
      method: "POST",
      body: JSON.stringify({ name: trimmed, colour }),
    });
    setSubmitting(false);
    if (res.error || !res.data) {
      setError(res.error ?? "Could not create repertoire");
      return;
    }
    setName("");
    onCreated(res.data);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Repertoire name"
        maxLength={100}
        aria-label="Repertoire name"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex gap-2" role="group" aria-label="Colour">
        {(["white", "black"] as const).map((c) => (
          <Button
            key={c}
            type="button"
            variant={colour === c ? "default" : "outline"}
            size="sm"
            className="flex-1 capitalize"
            onClick={() => setColour(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// ---- detail panel (tree + import/export) ----

function RepertoireDetailPanel({ id }: { id: string }) {
  const api = useApi();
  const [detail, setDetail] = useState<RepertoireDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const applyDetail = useCallback((data: RepertoireDetail) => {
    setDetail(data);
    // Seed "expand all" so a freshly-loaded tree shows its full shape.
    setExpanded(new Set(allNodeIds(data.tree)));
  }, []);

  const loadDetail = useCallback(async () => {
    setError(null);
    setDetail(null);
    const res = await api<RepertoireDetail>(`/api/repertoires/${id}`);
    if (res.error || !res.data) {
      setError(res.error ?? "Could not load repertoire");
      return;
    }
    applyDetail(res.data);
  }, [api, id, applyDetail]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const toggle = useCallback((nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  if (error) {
    return (
      <div>
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={() => void loadDetail()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!detail) {
    return <DetailSkeleton />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xl text-foreground">{detail.name}</h2>
        <Badge variant="secondary" className="capitalize">
          {detail.colour}
        </Badge>
      </div>

      <ImportExportPanel
        id={id}
        name={detail.name}
        onImported={applyDetail}
      />

      <div className="rounded-lg border border-border bg-card p-4">
        <RepertoireTree tree={detail.tree} expanded={expanded} onToggle={toggle} />
      </div>
    </section>
  );
}

function ImportExportPanel({
  id,
  name,
  onImported,
}: {
  id: string;
  name: string;
  onImported: (data: RepertoireDetail) => void;
}) {
  const api = useApi();
  const { getToken } = useAuth();

  const [open, setOpen] = useState(false);
  const [pgn, setPgn] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportMeta | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const runImport = async () => {
    if (!pgn.trim()) {
      setImportError("Paste a PGN first");
      return;
    }
    setImporting(true);
    setImportError(null);
    setResult(null);
    const res = await api<RepertoireDetail>(`/api/repertoires/${id}/import`, {
      method: "POST",
      body: JSON.stringify({ pgn }),
    });
    setImporting(false);
    if (res.error || !res.data) {
      setImportError(res.error ?? "Could not import PGN");
      return;
    }
    onImported(res.data);
    setResult((res.meta as ImportMeta | null) ?? null);
    setPgn("");
  };

  // Export returns text/plain with a Content-Disposition attachment (not the
  // JSON envelope), so it can't go through useApi()'s res.json(). Fetch it with
  // the same Clerk bearer token api.ts uses, then trigger a blob download.
  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/repertoires/${id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setExportError("Could not export repertoire");
        return;
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "repertoire"}.pgn`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export repertoire");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide import" : "Import PGN"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void runExport()} disabled={exporting}>
          {exporting ? "Exporting…" : "Export PGN"}
        </Button>
        {result && (
          <span className="text-sm text-muted-foreground">
            Imported: {result.inserted} new, {result.merged} already present.
          </span>
        )}
        {exportError && <span className="text-sm text-destructive">{exportError}</span>}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste PGN movetext (variations supported)…"
            rows={5}
            aria-label="PGN to import"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {importError && <p className="text-sm text-destructive">{importError}</p>}
          <Button size="sm" onClick={() => void runImport()} disabled={importing}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- small presentational helpers ----

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse space-y-2">
      <div className="h-10 w-48 rounded-md bg-muted" />
      <div className="h-10 w-48 rounded-md bg-muted" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="h-24 w-full rounded-lg bg-muted" />
    </div>
  );
}
