import { useState, useEffect, useCallback, Fragment } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './App.css';

const API = '';

interface RunEntry {
  requestId: string;
  tenantId?: string;
  timestamp: number;
  status: string;
  errorKind?: 'usage_limit';
  selectedGoalId?: string;
  error?: string;
  decision?: { actionType: string; actionPayload?: Record<string, unknown>; confidence?: number; reasoning?: string };
  actionResult?: { success?: boolean; error?: string; skipped?: boolean };
  stateTrace?: string[];
  observationSummary?: string[];
  dryRunMode?: 'with-llm' | 'without-llm';
  durationMs?: number;
}

interface ActiveRunEntry {
  requestId: string;
  tenantId?: string;
  startTime: number;
  currentState: string;
  stateTrace: string[];
}

interface AuditEventEntry {
  timestamp: number;
  tenantId?: string;
  requestId?: string;
  eventType: string;
  data: Record<string, unknown>;
}

interface DocEntry {
  id: string;
  title: string;
}

type Tab = 'runs' | 'events' | 'docs';

const estFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZoneName: 'short'
});

function formatTimestamp(timestamp: number, useEstTimezone: boolean): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return useEstTimezone ? estFormatter.format(date) : date.toISOString();
}

function App() {
  const [tab, setTab] = useState<Tab>('runs');
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [activeRuns, setActiveRuns] = useState<ActiveRunEntry[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AuditEventEntry[]>([]);
  const [eventRunFilter, setEventRunFilter] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [eventsConnected, setEventsConnected] = useState(false);
  const [useEstTimezone, setUseEstTimezone] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ui/runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch {
      setRuns([]);
    }
  }, []);

  const fetchActiveRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ui/active-runs`);
      if (res.ok) {
        const data = await res.json();
        setActiveRuns(data);
      }
    } catch {
      setActiveRuns([]);
    }
  }, []);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ui/docs`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      } else {
        setDocs([]);
      }
    } catch {
      setDocs([]);
    }
  }, []);

  const fetchDocContent = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/ui/docs/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setDocContent(data.content || '');
      } else {
        setDocContent('');
      }
    } catch {
      setDocContent('');
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await fetch(`${API}/ui/clear`, { method: 'POST' });
      setRuns([]);
      setActiveRuns([]);
      setEvents([]);
      setDocContent('');
      setSelectedDoc(null);
    } catch {
      /* ignore */
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- data fetch on tab change; setState runs in fetch .then callbacks */
  useEffect(() => {
    if (tab === 'runs') {
      fetchRuns();
      fetchActiveRuns();
    }
    if (tab === 'docs') fetchDocs();
  }, [tab, fetchRuns, fetchActiveRuns, fetchDocs]);

  useEffect(() => {
    if (tab !== 'runs' || activeRuns.length === 0) return;
    const interval = setInterval(fetchActiveRuns, 2000);
    return () => clearInterval(interval);
  }, [tab, activeRuns.length, fetchActiveRuns]);

  useEffect(() => {
    if (selectedDoc) fetchDocContent(selectedDoc);
  }, [selectedDoc, fetchDocContent]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/ui/config`);
        if (!res.ok) return;
        const data = await res.json() as { useEstTimezone?: boolean };
        setUseEstTimezone(data.useEstTimezone === true);
      } catch {
        /* ignore */
      }
    })();

    fetchActiveRuns();
    const ev = new EventSource(`${API}/ui/events`);
    ev.onopen = () => {
      setEventsConnected(true);
      fetchActiveRuns();
    };
    ev.onerror = () => setEventsConnected(false);
    ev.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data) as AuditEventEntry;
        setEvents((prev) => [entry, ...prev].slice(0, 500));
        if (entry.eventType === 'run_start' && entry.requestId) {
          const reqId = entry.requestId;
          setActiveRuns((prev) => {
            if (prev.some((r) => r.requestId === reqId)) return prev;
            return [...prev, { requestId: reqId, tenantId: entry.tenantId, startTime: entry.timestamp, currentState: 'observe', stateTrace: [] }];
          });
        }
        if (entry.eventType === 'run_progress' && entry.requestId && entry.data && typeof entry.data === 'object') {
          const data = entry.data as { state?: string; stateTrace?: string[] };
          const rid: string = entry.requestId;
          setActiveRuns((prev) => {
            const existing = prev.find((r) => r.requestId === rid);
            if (existing) {
              return prev.map((r) =>
                r.requestId === rid ? { ...r, currentState: data.state ?? r.currentState, stateTrace: (data.stateTrace ?? r.stateTrace) as string[] } : r
              );
            }
            const newRun: ActiveRunEntry = {
              requestId: rid,
              tenantId: entry.tenantId,
              startTime: entry.timestamp,
              currentState: data.state ?? 'observe',
              stateTrace: (data.stateTrace ?? []) as string[]
            };
            return [...prev, newRun];
          });
        }
        if (entry.eventType === 'run_complete' && entry.data && typeof entry.data === 'object') {
          const run = entry.data as unknown as RunEntry;
          if (run.requestId != null && run.timestamp != null) {
            setActiveRuns((prev) => prev.filter((r) => r.requestId !== run.requestId));
            setRuns((prev) => [run, ...prev.filter((r) => r.requestId !== run.requestId)].slice(0, 100));
          }
        }
      } catch {
        /* ignore */
      }
    };
    return () => ev.close();
  }, [fetchActiveRuns]);

  const sanitizedHtml = selectedDoc && docContent
    ? DOMPurify.sanitize(marked.parse(docContent) as string)
    : '';
  const visibleEvents = eventRunFilter ? events.filter((e) => e.requestId === eventRunFilter) : events;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ernest Observability</h1>
        <div className="tab-row">
          <button type="button" className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}>Runs</button>
          <button type="button" className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Audit Events</button>
          <button type="button" className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')}>Docs</button>
          <button type="button" className="clear-btn" onClick={clearAll}>Clear</button>
        </div>
      </header>
      <main className="app-main">
        {tab === 'runs' && (
          <div className="panel">
            {activeRuns.length > 0 && (
              <div className="active-runs-banner">
                <span className="spinner" aria-hidden />
                <strong>{activeRuns.length} run{activeRuns.length > 1 ? 's' : ''} in progress:</strong>
                {activeRuns.map((a) => (
                  <button
                    key={a.requestId}
                    type="button"
                    className="active-run-link"
                    onClick={() => {
                      setEventRunFilter(a.requestId);
                      setTab('events');
                    }}
                    title="Open this run in Audit Events"
                  >
                    {a.requestId} → {a.stateTrace?.length ? a.stateTrace.join(' → ') : a.currentState}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="refresh-btn" onClick={fetchRuns}>Refresh</button>
            <table className="runs-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  <th>Request ID</th>
                  <th>Tenant</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Goal</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <Fragment key={r.requestId}>
                    <tr
                      className={expandedRunId === r.requestId ? 'expanded' : ''}
                      onClick={() => setExpandedRunId(expandedRunId === r.requestId ? null : r.requestId)}
                    >
                      <td>{expandedRunId === r.requestId ? '▼' : '▶'}</td>
                      <td>{r.requestId}</td>
                      <td>{r.tenantId ?? '-'}</td>
                      <td>{formatTimestamp(r.timestamp, useEstTimezone)}</td>
                      <td>
                        {r.errorKind === 'usage_limit' ||
                        (r.status === 'error' && r.error?.toLowerCase().includes('usage limit'))
                          ? 'Usage limit'
                          : r.status}
                      </td>
                      <td>{r.selectedGoalId ?? '-'}</td>
                      <td>{r.durationMs != null ? `${r.durationMs}ms` : '-'}</td>
                    </tr>
                    {expandedRunId === r.requestId && (
                      <tr key={`${r.requestId}-detail`} className="detail-row">
                        <td colSpan={7}>
                          <div className="run-details">
                            {r.error && <p><strong>Error:</strong> {r.error}</p>}
                            {r.decision && (
                              <p><strong>Decision:</strong> <pre>{JSON.stringify(r.decision, null, 2)}</pre></p>
                            )}
                            {r.actionResult && (
                              <p><strong>ActionResult:</strong> <pre>{JSON.stringify(r.actionResult, null, 2)}</pre></p>
                            )}
                            {r.dryRunMode && <p><strong>Dry run:</strong> {r.dryRunMode}</p>}
                            {r.stateTrace && r.stateTrace.length > 0 && (
                              <p><strong>State trace:</strong> <pre>{r.stateTrace.join('\n')}</pre></p>
                            )}
                            {r.observationSummary && r.observationSummary.length > 0 && (
                              <p><strong>Observations:</strong> <pre>{r.observationSummary.join('\n')}</pre></p>
                            )}
                            {!r.error && !r.decision && !r.actionResult && !r.dryRunMode && !r.stateTrace?.length && !r.observationSummary?.length && (
                              <p className="muted">No additional details</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'events' && (
          <div className="panel">
            {eventsConnected ? <span className="badge">SSE connected</span> : <span className="badge off">SSE disconnected</span>}
            <div className="event-controls">
              {eventRunFilter ? (
                <>
                  <span className="event-filter-chip">Filtering run: {eventRunFilter}</span>
                  <button type="button" className="refresh-btn" onClick={() => setEventRunFilter(null)}>Clear filter</button>
                </>
              ) : (
                <span className="event-filter-chip muted">Showing all runs</span>
              )}
            </div>
            <ul className="events-list">
              {visibleEvents.map((e, i) => (
                <li key={`${e.timestamp}-${i}`}>
                  <span className="event-time">{formatTimestamp(e.timestamp, useEstTimezone)}</span>
                  <span className="event-type">{e.eventType}</span>
                  <pre>{JSON.stringify(e.data, null, 2)}</pre>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'docs' && (
          <div className="panel docs-panel">
            <aside className="docs-list">
              <button type="button" onClick={fetchDocs}>Refresh</button>
              <ul>
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" className={selectedDoc === d.id ? 'active' : ''} onClick={() => setSelectedDoc(d.id)}>{d.title}</button>
                  </li>
                ))}
              </ul>
            </aside>
            <section className="docs-viewer">
              {selectedDoc ? (
                <div className="markdown-body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              ) : (
                <p>Select a doc</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
