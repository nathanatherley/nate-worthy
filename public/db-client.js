// Drop-in replacement for the Claude-artifact window.storage API, backed by
// your real backend instead. Same method names, same shapes — this is what
// lets nearly all of the existing app's code keep working unchanged.
window.storage = {
  async get(key, shared) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}?shared=${!!shared}`);
    if (!res.ok) throw new Error('not found');
    return res.json();
  },
  async set(key, value, shared) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, shared: !!shared }),
    });
    if (!res.ok) return null;
    return res.json();
  },
  async delete(key, shared) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}?shared=${!!shared}`, { method: 'DELETE' });
    if (!res.ok) return null;
    return res.json();
  },
  async list(prefix, shared) {
    const res = await fetch(`/api/storage?prefix=${encodeURIComponent(prefix || '')}&shared=${!!shared}`);
    if (!res.ok) return { keys: [] };
    return res.json();
  },
};
