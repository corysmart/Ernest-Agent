import { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './App.css';

const API = '';

interface RunEntry {
  requestId: string;
  tenantId?: string;
  timestamp: number;
  status: string;
  selectedGoalId?: string;
  error?: string;
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

function App() {
  const [tab, setTab] = useState<Tab>('runs');
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [events, setEvents] = useState<AuditEventEntry[]>([]);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [eventsConnected, setEventsConnected] = useState(false);

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
      setEvents([]);
      setDocContent('');
      setSelectedDoc(null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab === 'runs') fetchRuns();
    if (tab === 'docs') fetchDocs();
  }, [tab, fetchRuns, fetchDocs]);

  useEffect(() => {
    if (selectedDoc) fetchDocContent(selectedDoc);
  }, [selectedDoc, fetchDocContent]);

  useEffect(() => {
    const ev = new EventSource(`${API}/ui/events`);
    ev.onopen = () => setEventsConnected(true);
    ev.onerror = () => setEventsConnected(false);
    ev.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data) as AuditEventEntry;
        setEvents((prev) => [entry, ...prev].slice(0, 500));
      } catch {
        /* ignore */
      }
    };
    return () => ev.close();
  }, []);

  const sanitizedHtml = selectedDoc && docContent
    ? DOMPurify.sanitize(marked.parse(docContent) as string)
    : '';

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
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Tenant</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Goal</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.requestId}>
                    <td>{r.requestId}</td>
                    <td>{r.tenantId ?? '-'}</td>
                    <td>{new Date(r.timestamp).toISOString()}</td>
                    <td>{r.status}</td>
                    <td>{r.selectedGoalId ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'events' && (
          <div className="panel">
            {eventsConnected ? <span className="badge">SSE connected</span> : <span className="badge off">SSE disconnected</span>}
            <ul className="events-list">
              {events.map((e, i) => (
                <li key={`${e.timestamp}-${i}`}>
                  <span className="event-time">{new Date(e.timestamp).toISOString()}</span>
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
