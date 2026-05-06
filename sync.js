/* ───────────────────────────────────────────────────────────────────
   School Civics — Cloud Sync (sync.js)
   ───────────────────────────────────────────────────────────────────
   This script owns the cross-device sync token (the JSONBlob bin ID).
   It can collect new tokens, remember them across sessions, switch
   between them, and exposes a tiny `CloudSync` API the rest of the app
   uses to read/write the active bin.

   Token storage:
     - Each token is stored in localStorage under `sc_cloud_tokens_v1`
       as { id, label, addedAt }.
     - The currently-selected token is stored under
       `sc_cloud_active_token`.
     - DEFAULT_TOKEN below is auto-added the first time the script runs.

   Public API (window.CloudSync):
     - DEFAULT_TOKEN                  : the bin baked into this script
     - listTokens()                   : array of saved tokens
     - activeToken()                  : the bin ID currently in use
     - setActiveToken(id)             : switch to a different bin
     - rememberToken(id, label?)      : store a new bin (returns it)
     - forgetToken(id)                : remove a saved bin
     - cloudSave(data, [token])       : PUT JSON to the bin
     - cloudLoad([token])             : GET JSON from the bin
     - createNewBin(seed?)            : create a fresh bin on the server
                                        and remember it
   ────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  // ─── CONFIG ───
  const CLOUD_BASE      = 'https://jsonblob.com/api/jsonBlob';
  const TOKEN_LS_KEY    = 'sc_cloud_tokens_v1';
  const ACTIVE_LS_KEY   = 'sc_cloud_active_token';

  // The bin everyone shares by default. To rotate, create a new bin via
  // CloudSync.createNewBin() (or at jsonblob.com manually) and replace
  // this string. Anyone with this ID can read or write the bin.
  const DEFAULT_TOKEN   = '019dfa5e-ec23-79a1-87d7-2eafc8252bda';
  const DEFAULT_LABEL   = 'School Civics — main';

  // ─── TOKEN STORE ───
  function _readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function _writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function _isValidToken(s) {
    return typeof s === 'string' && s.length >= 8 && s.length <= 80
      && /^[A-Za-z0-9._-]+$/.test(s);
  }

  function listTokens() {
    return _readJSON(TOKEN_LS_KEY, []).slice();
  }
  function _saveTokens(arr) {
    _writeJSON(TOKEN_LS_KEY, arr);
  }
  function rememberToken(id, label) {
    if (!_isValidToken(id)) throw new Error('Invalid token id');
    const tokens = listTokens();
    if (!tokens.find(t => t.id === id)) {
      tokens.push({ id, label: label || id.slice(0, 8), addedAt: Date.now() });
      _saveTokens(tokens);
    }
    return id;
  }
  function forgetToken(id) {
    const next = listTokens().filter(t => t.id !== id);
    _saveTokens(next);
    if (activeToken() === id) {
      const fallback = next[0] ? next[0].id : DEFAULT_TOKEN;
      setActiveToken(fallback);
    }
  }
  function activeToken() {
    const stored = (function () {
      try { return localStorage.getItem(ACTIVE_LS_KEY) || ''; }
      catch (e) { return ''; }
    })();
    return _isValidToken(stored) ? stored : DEFAULT_TOKEN;
  }
  function setActiveToken(id) {
    if (!_isValidToken(id)) throw new Error('Invalid token id');
    rememberToken(id);
    try { localStorage.setItem(ACTIVE_LS_KEY, id); } catch (e) {}
    return id;
  }

  // Seed the default token on first run so it shows up in listTokens().
  (function _seedDefault() {
    const tokens = listTokens();
    if (!tokens.find(t => t.id === DEFAULT_TOKEN)) {
      tokens.unshift({
        id: DEFAULT_TOKEN, label: DEFAULT_LABEL,
        addedAt: Date.now(), builtIn: true
      });
      _saveTokens(tokens);
    }
  })();

  // ─── HTTP ───
  async function cloudSave(data, token) {
    const id = token || activeToken();
    if (!id) return { ok: false, status: 0, error: 'no-token' };
    try {
      const r = await fetch(`${CLOUD_BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }

  async function cloudLoad(token) {
    const id = token || activeToken();
    if (!id) return null;
    try {
      const r = await fetch(`${CLOUD_BASE}/${id}?t=${Date.now()}`, {
        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
      });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function createNewBin(seed) {
    const initial = seed || {
      todos: [], events: {}, applicants: [], roles: [],
      announcements: [], notesByUser: {}, settings: { siteLink: '' },
      updatedAt: Date.now()
    };
    try {
      const r = await fetch(CLOUD_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(initial)
      });
      if (!r.ok) return null;
      const id = r.headers.get('x-jsonblob-id')
        || (r.headers.get('location') || '').split('/').pop();
      if (!id) return null;
      rememberToken(id, 'New bin · ' + new Date().toLocaleDateString());
      return id;
    } catch (e) { return null; }
  }

  // ─── EXPORT ───
  global.CloudSync = {
    DEFAULT_TOKEN: DEFAULT_TOKEN,
    listTokens: listTokens,
    activeToken: activeToken,
    setActiveToken: setActiveToken,
    rememberToken: rememberToken,
    forgetToken: forgetToken,
    cloudSave: cloudSave,
    cloudLoad: cloudLoad,
    createNewBin: createNewBin
  };
})(typeof window !== 'undefined' ? window : globalThis);
