// Accounts + sync via Supabase. The app still works fully offline / signed out.
(function () {
  const SUPABASE_URL = 'https://lgluybfzrkhwtfpimran.supabase.co';
  // Publishable key: designed to be public. Access is protected by row-level security.
  const SUPABASE_KEY = 'sb_publishable_kEcNR-zw6j2ozSemLzzf4A_dwWrKcG9';
  const META_KEY = 'locked-in:sync';
  const $ = (sel) => document.querySelector(sel);

  let client = null;
  let user = null;
  let status = 'signed-out'; // signed-out | syncing | synced | offline | error | unavailable
  let statusDetail = '';
  let pushTimer = null;
  let pushing = null;
  let pulling = null;
  let editVersion = 0;
  let healthToken = null;
  let authMode = 'signin';

  // Sync bookkeeping, per device
  let meta = { userId: null, remoteAt: null, dirty: false };
  try {
    meta = { ...meta, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') };
  } catch (e) {
    /* storage blocked */
  }
  const saveMeta = () => {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      /* storage blocked */
    }
  };

  function setStatus(s, detail = '') {
    status = s;
    statusDetail = detail;
    renderStatus();
  }

  // ---------- Sync ----------
  async function fetchRemote() {
    const { data, error } = await client.from('user_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function upload() {
    const version = editVersion;
    const { data, error } = await client
      .from('user_data')
      .upsert({ user_id: user.id, data: Store.state })
      .select('updated_at')
      .single();
    if (error) throw error;
    meta.remoteAt = data.updated_at;
    meta.dirty = editVersion !== version; // edited again while uploading?
    saveMeta();
    if (meta.dirty) schedulePush();
  }

  async function pullHealth() {
    const since = Util.addDays(Util.today(), -400);
    const { data, error } = await client
      .from('health_days')
      .select('day, steps, active_kcal, sleep_hours')
      .eq('user_id', user.id)
      .gte('day', since);
    if (error) throw error;
    let changed = false;
    const health = Store.state.health;
    data.forEach((r) => {
      const next = { ...health[r.day] };
      if (r.steps != null) next.steps = r.steps;
      if (r.active_kcal != null) next.activeKcal = Number(r.active_kcal);
      if (r.sleep_hours != null) next.sleepHours = Number(r.sleep_hours);
      if (JSON.stringify(next) !== JSON.stringify(health[r.day] || {})) {
        health[r.day] = next;
        changed = true;
      }
    });
    if (changed) {
      Store.save({ fromCloud: true });
      editVersion++;
      meta.dirty = true; // include in the main copy so other devices see it offline too
      saveMeta();
      schedulePush();
    }
  }

  // Bring this device up to date with the account, merging if both sides changed.
  async function pull() {
    if (!client || !user) return;
    if (pulling) return pulling;
    pulling = (async () => {
      if (!navigator.onLine) return setStatus('offline');
      setStatus('syncing');
      try {
        const firstLink = meta.userId !== user.id;
        const remote = await fetchRemote();
        if (!remote) {
          // Brand new account: upload whatever is on this device.
          meta.userId = user.id;
          await upload();
        } else if (firstLink) {
          meta.userId = user.id;
          if (Store.isEmpty()) {
            Store.replace(remote.data, { fromCloud: true });
            meta.remoteAt = remote.updated_at;
            meta.dirty = false;
            saveMeta();
          } else {
            // Data on this device from before signing in: keep both.
            Store.replace(Store.merge(remote.data, Store.state), { fromCloud: true });
            await upload();
            App.toast('Your data on this device was merged into your account');
          }
        } else if (remote.updated_at !== meta.remoteAt) {
          if (meta.dirty) {
            Store.replace(Store.merge(remote.data, Store.state), { fromCloud: true });
            await upload();
          } else {
            Store.replace(remote.data, { fromCloud: true });
            meta.remoteAt = remote.updated_at;
            saveMeta();
          }
        } else if (meta.dirty) {
          await upload();
        }
        await pullHealth().catch((e) => console.warn('Health sync skipped', e));
        setStatus(meta.dirty ? 'syncing' : 'synced');
      } catch (e) {
        console.warn('Sync failed', e);
        setStatus('error', friendlyError(e));
      }
    })().finally(() => (pulling = null));
    return pulling;
  }

  async function push() {
    if (!client || !user || !navigator.onLine) return;
    if (pushing || pulling) return schedulePush();
    pushing = (async () => {
      setStatus('syncing');
      try {
        // Another device saved since we last synced? Merge instead of overwriting it.
        const remote = await fetchRemote();
        if (remote && meta.remoteAt && remote.updated_at !== meta.remoteAt) {
          Store.replace(Store.merge(remote.data, Store.state), { fromCloud: true });
        }
        await upload();
        setStatus(meta.dirty ? 'syncing' : 'synced');
      } catch (e) {
        console.warn('Upload failed', e);
        setStatus('error', friendlyError(e));
      }
    })().finally(() => (pushing = null));
    return pushing;
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  function onLocalChange(state, opts) {
    if (opts && opts.fromCloud) return;
    editVersion++;
    if (!user) return;
    meta.dirty = true;
    saveMeta();
    if (status === 'synced') setStatus('syncing');
    schedulePush();
  }

  function friendlyError(e) {
    const msg = (e && (e.message || e.error_description)) || String(e);
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(msg))
      return 'The database tables are not set up yet. Run supabase/schema.sql in the Supabase SQL Editor.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Could not reach the server. Check your connection.';
    return msg;
  }

  // ---------- Auth ----------
  const redirectUrl = () => location.origin + location.pathname;

  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw error;
    return !data.session; // true = needs email confirmation
  }

  async function signOut() {
    if (meta.dirty) await push();
    if (meta.dirty && !confirm('Some changes have not synced yet and will be lost. Sign out anyway?')) return;
    await client.auth.signOut();
    // Your data is safe in your account; remove it from this device.
    meta = { userId: null, remoteAt: null, dirty: false };
    saveMeta();
    healthToken = null;
    Store.reset({ fromCloud: true });
    App.toast('Signed out');
  }

  async function getHealthToken(regenerate = false) {
    if (regenerate) {
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const { data, error } = await client.from('health_tokens').upsert({ user_id: user.id, token }).select('token').single();
      if (error) throw error;
      return data.token;
    }
    const { data, error } = await client.from('health_tokens').select('token').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data) return data.token;
    const created = await client.from('health_tokens').insert({ user_id: user.id }).select('token').single();
    if (created.error) throw created.error;
    return created.data.token;
  }

  // ---------- UI ----------
  const STATUS_TEXT = {
    'signed-out': '☁️ Not signed in',
    syncing: '🔄 Syncing…',
    synced: '✅ Synced',
    offline: '📴 Offline, will sync later',
    error: '⚠️ Sync problem',
    unavailable: '⚠️ Accounts unavailable',
  };

  function renderStatus() {
    const pill = $('#sync-pill');
    if (pill) {
      pill.textContent = STATUS_TEXT[status];
      pill.title = statusDetail || (user ? user.email : 'Sign in to sync across devices');
    }
    const s = $('#account-sync-status');
    if (s) s.innerHTML = `${STATUS_TEXT[status]}${statusDetail ? `<div class="muted small">${Util.esc(statusDetail)}</div>` : ''}`;
    const banner = $('#signin-banner');
    if (banner) {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem('locked-in:banner-dismissed') === '1';
      } catch (e) {
        /* ignore */
      }
      banner.hidden = !!user || !client || dismissed;
    }
  }

  function renderAccount() {
    const box = $('#account-box');
    if (!box) return;
    if (!client) {
      box.innerHTML = '<p class="muted">Accounts could not load. Your data is still saved on this device.</p>';
      return;
    }
    if (location.protocol === 'file:') {
      box.innerHTML = `<p class="muted">Accounts work on the online version of the site (e.g. GitHub Pages), not when opening the file directly. Your data is saved on this device.</p>`;
      return;
    }
    if (!user) {
      const signup = authMode === 'signup';
      box.innerHTML = `
        <p class="muted">${signup ? 'Create an account to back up your data and use it on your phone, laptop and any other device.' : 'Sign in to sync your data across devices.'}</p>
        <form id="auth-form" class="auth-form">
          <input id="auth-email" type="email" placeholder="Email" autocomplete="email" required>
          <input id="auth-password" type="password" placeholder="Password${signup ? ' (at least 6 characters)' : ''}" minlength="6"
            autocomplete="${signup ? 'new-password' : 'current-password'}" required>
          <button class="btn primary wide" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
          <div class="auth-msg small" id="auth-msg" role="status"></div>
        </form>
        <div class="row gap wrap small">
          <button class="link-btn" id="auth-switch">${signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
          ${signup ? '' : '<button class="link-btn" id="auth-forgot">Forgot password?</button>'}
        </div>`;
      const msg = (t, bad) => {
        $('#auth-msg').textContent = t;
        $('#auth-msg').classList.toggle('bad', !!bad);
      };
      $('#auth-switch').onclick = () => {
        authMode = signup ? 'signin' : 'signup';
        renderAccount();
      };
      if (!signup)
        $('#auth-forgot').onclick = async () => {
          const email = $('#auth-email').value.trim();
          if (!email) return msg('Type your email above first.', true);
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
          msg(error ? error.message : 'Check your email for a link to reset your password.', !!error);
        };
      $('#auth-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        msg(signup ? 'Creating account…' : 'Signing in…');
        try {
          if (signup) {
            const needsConfirm = await signUp(email, password);
            if (needsConfirm) msg('Almost done: check your email and click the link to confirm your account.');
          } else {
            await signIn(email, password);
          }
        } catch (err) {
          msg(/Invalid login/i.test(err.message) ? 'Wrong email or password.' : err.message, true);
        } finally {
          btn.disabled = false;
        }
      };
      return;
    }
    box.innerHTML = `
      <p>Signed in as <b>${Util.esc(user.email)}</b></p>
      <div id="account-sync-status" class="account-status"></div>
      <div class="row gap wrap" style="margin-top:12px">
        <button class="btn" id="sync-now">🔄 Sync now</button>
        <button class="btn ghost" id="sign-out">Sign out</button>
      </div>`;
    $('#sync-now').onclick = () => pull();
    $('#sign-out').onclick = () => signOut();
    renderStatus();
  }

  async function renderHealthSetup() {
    const box = $('#health-setup');
    if (!box) return;
    if (!user) {
      box.innerHTML = `<p class="muted">Sign in above to send steps from Apple Health automatically, in the background.</p>
        <p class="muted small">Without an account, a Shortcut can still open this link to log steps on this device:<br>
        <code>${Util.esc(redirectUrl())}#import?steps=STEPS&amp;date=YYYY-MM-DD</code></p>`;
      return;
    }
    box.innerHTML = '<p class="muted">Loading…</p>';
    try {
      healthToken = healthToken || (await getHealthToken());
    } catch (e) {
      box.innerHTML = `<p class="bad small">${Util.esc(friendlyError(e))}</p>`;
      return;
    }
    const body = `{"p_token": "${healthToken}", "p_date": "<Formatted Date>", "p_steps": <Steps>}`;
    const field = (label, value, id) => `<div class="copy-field"><span class="muted small">${label}</span>
      <div class="row gap"><input readonly value="${Util.esc(value)}" id="${id}"><button class="btn small" data-copy="${id}">Copy</button></div></div>`;
    box.innerHTML = `
      <ol class="steps-guide">
        <li>On your iPhone open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Time of Day</b>. Pick a time you're usually on your phone, e.g. 21:00 (iPhone can't read Health while locked), set <b>Daily</b>, then choose <b>Run Immediately</b>. You can add more automations at other times; each run updates today's total.</li>
        <li>Add the action <b>Find Health Samples</b>: type <i>Steps</i>, filter <i>Start Date is today</i>.</li>
        <li>Add <b>Calculate Statistics</b> → <i>Sum</i> of the Health Samples. Rename the result to <i>Steps</i>.</li>
        <li>Add <b>Format Date</b> → <i>Current Date</i>, Date Format <i>Custom</i>: <code>yyyy-MM-dd</code>.</li>
        <li>Add <b>Get Contents of URL</b> with the URL below. Tap <i>Show More</i>: Method <b>POST</b>, add the two <b>Headers</b> below, Request Body <b>JSON</b> with fields
          <code>p_token</code> (Text, your token), <code>p_date</code> (Text, the Formatted Date) and <code>p_steps</code> (Number, Steps).</li>
        <li>Run it once by hand. iPhone will ask permission to read Steps; allow it. Then tap <b>Sync now</b> above.</li>
      </ol>
      ${field('URL', `${SUPABASE_URL}/rest/v1/rpc/log_health`, 'hs-url')}
      ${field('Header: apikey', SUPABASE_KEY, 'hs-key')}
      ${field('Header: Content-Type', 'application/json', 'hs-ct')}
      ${field('Your secret token (p_token)', healthToken, 'hs-token')}
      <p class="muted small">The JSON body ends up like: <code>${Util.esc(body)}</code></p>
      <p class="muted small">Want more? Add <code>p_active_kcal</code> (Active Energy) and <code>p_sleep_hours</code> the same way.
      Keep your token private. If it leaks, <button class="link-btn" id="hs-regen">make a new one</button> and update your Shortcut.</p>`;
    box.querySelectorAll('[data-copy]').forEach(
      (b) =>
        (b.onclick = async () => {
          const input = document.getElementById(b.dataset.copy);
          try {
            await navigator.clipboard.writeText(input.value);
          } catch (e) {
            input.select();
            document.execCommand('copy');
          }
          App.toast('Copied');
        })
    );
    $('#hs-regen').onclick = async () => {
      if (!confirm('Make a new token? Your current Shortcut will stop working until you paste the new one in.')) return;
      try {
        healthToken = await getHealthToken(true);
        renderHealthSetup();
      } catch (e) {
        App.toast(friendlyError(e));
      }
    };
  }

  function render() {
    renderAccount();
    renderHealthSetup();
    renderStatus();
  }

  function init() {
    Store.onChange(onLocalChange);
    const dismiss = $('#banner-dismiss');
    if (dismiss)
      dismiss.onclick = () => {
        try {
          localStorage.setItem('locked-in:banner-dismissed', '1');
        } catch (e) {
          /* ignore */
        }
        renderStatus();
      };

    if (!window.supabase || location.protocol === 'file:') {
      setStatus(window.supabase ? 'signed-out' : 'unavailable');
      return;
    }
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) {
      console.warn('Supabase unavailable', e);
      setStatus('unavailable');
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      const was = user && user.id;
      user = session ? session.user : null;
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(async () => {
          const pw = prompt('Choose a new password (at least 6 characters):');
          if (!pw) return;
          const { error } = await client.auth.updateUser({ password: pw });
          App.toast(error ? error.message : 'Password updated');
        }, 0);
      }
      if (!user) setStatus('signed-out');
      if ((user && user.id) !== was) {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => {
          render();
          if (user) {
            if (event === 'SIGNED_IN' && !was) App.toast(`Signed in as ${user.email}`);
            pull();
          }
        }, 0);
      }
    });

    window.addEventListener('online', () => pull());
    window.addEventListener('offline', () => user && setStatus('offline'));
    document.addEventListener('visibilitychange', () => !document.hidden && pull());
    setInterval(() => !document.hidden && pull(), 60000);
  }

  window.Cloud = { init, render, pull, get user() { return user; } };
})();
