/* Shared accounts, friend requests, and leaderboards for Mooncap Keep. */
(() => {
  'use strict';
  const config = window.MOONCAP_SUPABASE;
  const status = document.querySelector('#onlineStatus');
  const setStatus = (message) => { if (status) status.textContent = message; };
  const toast = (message) => {
    const node = document.querySelector('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.mooncapToastTimer);
    window.mooncapToastTimer = setTimeout(() => node.classList.remove('show'), 2500);
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatTime = (seconds) => {
    const n = Math.max(0, Number(seconds) | 0);
    return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
  };
  const configReady = config && /^https:\/\/[\w-]+\.supabase\.co$/.test(config.url || '') &&
    config.anonKey && !String(config.anonKey).includes('YOUR_');
  if (!configReady || !window.supabase?.createClient) {
    window.MOONCAP_ONLINE_ACTIVE = false;
    setStatus('Online services are not configured yet. Follow README.md to connect a Supabase project; the campaign remains playable offline.');
    document.querySelector('#scoreRows').innerHTML = '<tr><td colspan="4" class="empty">Connect Supabase to see shared player rankings.</td></tr>';
    document.querySelector('#friendResults').innerHTML = '<div class="empty">Connect Supabase and sign in to find other defenders.</div>';
    document.querySelector('#friendList').innerHTML = '<div class="empty">Connect Supabase and sign in to build your fellowship.</div>';
    document.querySelector('#createProfile').onclick = () => toast('Add your Supabase project settings in supabase-config.js first.');
    document.querySelector('#signIn').onclick = () => toast('Add your Supabase project settings in supabase-config.js first.');
    document.querySelector('#signOut').onclick = document.querySelector('#profileSignOut').onclick = () => toast('You are playing as a guest.');
    document.querySelector('#searchBtn').onclick = () => toast('Online friends need a configured account.');
    return;
  }

  window.MOONCAP_ONLINE_ACTIVE = true;
  const client = window.supabase.createClient(config.url, config.anonKey);
  window.MooncapOnline = { friendCount: 0 };
  let currentUser = null;
  let syncTimer = 0;
  const columnFor = { arrows:'total_arrows', enemies:'enemies_defeated', towers:'towers_defeated', time:'time_played_seconds' };
  const labelFor = { arrows:'Arrows used', enemies:'Enemies defeated', towers:'Towers defeated', time:'Time played' };

  async function hydrateSession(user) {
    currentUser = user || null;
    if (!currentUser) {
      window.MooncapOnline.friendCount = 0;
      setStatus('Signed out. Your campaign remains saved in this browser.');
      document.querySelector('#accountState').textContent = 'Guest session';
      document.querySelector('#friendCount').textContent = '0';
      document.querySelector('#friendList').innerHTML = '<div class="empty">Sign in to see your fellowship.</div>';
      document.querySelector('#friendResults').innerHTML = '<div class="empty">Sign in to find other defenders.</div>';
      document.querySelector('#scoreRows').innerHTML = '<tr><td colspan="4" class="empty">Shared realm rankings will appear here.</td></tr>';
      window.MooncapGame?.clearProfile();
      await refreshScores();
      return;
    }
    const { data: profile, error } = await client.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error || !profile) {
      setStatus('Could not load your profile. Check the Supabase setup and try signing in again.');
      console.error('Mooncap profile load failed:', error);
      return;
    }
    window.MooncapGame?.importProfile(profile);
    document.querySelector('#accountState').textContent = `Signed in as ${profile.display_name}`;
    setStatus(`Online as @${profile.username}. Progress syncs to your account while you play.`);
    await syncStats();
    await Promise.all([refreshScores(), refreshFriends()]);
  }

  async function syncStats() {
    if (!currentUser || !window.MooncapGame) return;
    const local = window.MooncapGame.stats();
    const { data: remote, error: readError } = await client.from('profiles')
      .select('total_arrows,enemies_defeated,towers_defeated,time_played_seconds,best_wave')
      .eq('id', currentUser.id).single();
    if (readError || !remote) return;
    const values = {
      total_arrows: Math.max(local.arrows, Number(remote.total_arrows) || 0),
      enemies_defeated: Math.max(local.kills, Number(remote.enemies_defeated) || 0),
      towers_defeated: Math.max(local.towers, Number(remote.towers_defeated) || 0),
      time_played_seconds: Math.max(local.played, Number(remote.time_played_seconds) || 0),
      best_wave: Math.max(local.bestWave, Number(remote.best_wave) || 1)
    };
    const { error } = await client.from('profiles').update(values).eq('id', currentUser.id);
    if (error) { console.error('Mooncap stats sync failed:', error); return; }
    window.MooncapGame.importProfile({ ...values, display_name: local.name });
    await refreshScores();
  }

  function queueSync() {
    if (!currentUser) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncStats().catch(console.error), 1400);
  }

  async function refreshScores() {
    const body = document.querySelector('#scoreRows');
    if (!body) return;
    const score = document.querySelector('#scoreTabs .tab.active')?.dataset.score || 'arrows';
    const column = columnFor[score] || columnFor.arrows;
    const title = {arrows:'Most arrows used',enemies:'Most raiders defeated',towers:'Most towers defeated',time:'Most time played'}[score];
    document.querySelector('#scoreTitle').innerHTML = `${title} <span>Online defenders</span>`;
    document.querySelector('#scoreHead').textContent = labelFor[score] || labelFor.arrows;
    const { data, error } = await client.from('profiles')
      .select('id,username,display_name,total_arrows,enemies_defeated,towers_defeated,time_played_seconds,best_wave')
      .order(column, { ascending:false }).order('username', { ascending:true }).limit(100);
    if (error) {
      body.innerHTML = '<tr><td colspan="4" class="empty">Could not load rankings. Check the database setup.</td></tr>';
      console.error('Mooncap leaderboard load failed:', error);
      return;
    }
    body.innerHTML = data.length ? data.map((p,i) => {
      const val = Number(p[column]) || 0;
      const mine = p.id === currentUser?.id;
      return `<tr><td class="rank">${i===0?'✦ ':''}${i+1}</td><td><div class="player"><span class="mini-avatar">${mine?'🧙':'🪄'}</span>${escapeHtml(p.display_name)} <span class="stat-hint">@${escapeHtml(p.username)}</span>${mine?'<span class="you-tag">YOU</span>':''}</div></td><td>${score==='time'?formatTime(val):val.toLocaleString()}</td><td>Wave ${Number(p.best_wave)||1}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">No defenders have joined the realm yet.</td></tr>';
  }

  async function refreshFriends() {
    if (!currentUser) return;
    const { data: links, error } = await client.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    if (error) { console.error('Mooncap friends load failed:', error); return; }
    const accepted = (links || []).filter(x => x.status === 'accepted');
    const pending = (links || []).filter(x => x.status === 'pending' && x.receiver_id === currentUser.id);
    const ids = [...new Set([...accepted.map(x => x.sender_id === currentUser.id ? x.receiver_id : x.sender_id), ...pending.map(x=>x.sender_id)])];
    let profiles = [];
    if (ids.length) {
      const result = await client.from('profiles').select('id,username,display_name').in('id', ids);
      if (!result.error) profiles = result.data || [];
    }
    window.MooncapOnline.friendCount = accepted.length;
    document.querySelector('#friendCount').textContent = String(accepted.length);
    document.querySelector('#friendList').innerHTML = accepted.length || pending.length
      ? [...pending.map(request => {
          const p = profiles.find(x=>x.id===request.sender_id);
          return `<div class="friend-result"><div class="player"><span class="mini-avatar">🧙</span>${escapeHtml(p?.display_name||'Defender')} <span class="badge">Request</span></div><button class="btn primary" data-accept="${request.id}" data-sender="${request.sender_id}">Accept</button></div>`;
        }), ...accepted.map(link => {
          const id = link.sender_id === currentUser.id ? link.receiver_id : link.sender_id;
          const p = profiles.find(x=>x.id===id);
          return `<div class="friend-result"><div class="player"><span class="mini-avatar">🧙</span>${escapeHtml(p?.display_name||'Defender')} <span class="stat-hint">@${escapeHtml(p?.username||'unknown')}</span></div><span class="badge">Fellow defender</span></div>`;
        })].join('')
      : '<div class="empty">No friends yet. Search for a defender to send a request.</div>';
    document.querySelectorAll('[data-accept]').forEach(button => button.onclick = async () => {
      const { error } = await client.from('friend_requests').update({status:'accepted'}).eq('id',button.dataset.accept).eq('receiver_id',currentUser.id);
      if (error) toast('Could not accept that request.'); else { toast('Defender welcomed to your fellowship.'); await refreshFriends(); }
    });
  }

  async function searchPlayers() {
    const term = document.querySelector('#friendSearch').value.trim();
    const results = document.querySelector('#friendResults');
    if (!currentUser) { results.innerHTML = '<div class="empty">Sign in to search and add friends.</div>'; return; }
    if (term.length < 2) { results.innerHTML = '<div class="empty">Enter at least two characters to search.</div>'; return; }
    if (!/^[\p{L}\p{N}_ .'-]{2,24}$/u.test(term)) { results.innerHTML = '<div class="empty">Use letters, numbers, spaces, hyphens, or underscores.</div>'; return; }
    results.innerHTML = '<div class="empty">Searching the realm…</div>';
    const { data, error } = await client.from('profiles').select('id,username,display_name').ilike('username', `%${term}%`).neq('id',currentUser.id).limit(20);
    if (error) { results.innerHTML = '<div class="empty">Search failed. Please try again.</div>'; return; }
    if (!data.length) { results.innerHTML = '<div class="empty">No defender found. Search by username.</div>'; return; }
    const rendered = await Promise.all(data.map(async p => {
      const { data: relation } = await client.from('friend_requests').select('id,status,sender_id,receiver_id')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${currentUser.id})`).limit(1).maybeSingle();
      let label = '＋ Add friend', disabled = false;
      if (relation?.status === 'accepted') { label = '✓ Friends'; disabled = true; }
      else if (relation?.status === 'pending') { label = relation.sender_id === currentUser.id ? 'Request sent' : 'Incoming request'; disabled = true; }
      return `<div class="friend-result"><div class="player"><span class="mini-avatar">🧙</span>${escapeHtml(p.display_name)} <span class="stat-hint">@${escapeHtml(p.username)}</span></div><button class="btn ${disabled?'':'primary'}" data-add="${p.id}" ${disabled?'disabled':''}>${label}</button></div>`;
    }));
    results.innerHTML = rendered.join('');
    results.querySelectorAll('[data-add]').forEach(button => button.onclick = async () => {
      const { error } = await client.from('friend_requests').insert({sender_id:currentUser.id, receiver_id:button.dataset.add});
      if (error) toast(error.code === '23505' ? 'A request already exists.' : 'Could not send the friend request.');
      else { toast('Friend request sent.'); button.textContent='Request sent'; button.disabled=true; await refreshFriends(); }
    });
  }

  document.querySelector('#createProfile').onclick = async () => {
    const username = document.querySelector('#nameInput').value.trim().toLowerCase();
    const displayName = document.querySelector('#nameInput').value.trim();
    const email = document.querySelector('#emailInput').value.trim();
    const password = document.querySelector('#passwordInput').value;
    if (!/^[a-z0-9_]{3,18}$/.test(username)) { toast('Player name must be 3–18 letters, numbers, or underscores.'); return; }
    if (displayName.length > 24 || displayName.length < 2) { toast('Player name must be 2–24 characters.'); return; }
    if (!email || password.length < 8) { toast('Enter your email and a password with at least 8 characters.'); return; }
    setStatus('Creating your online profile…');
    const { data, error } = await client.auth.signUp({email,password,options:{data:{username,display_name:displayName}}});
    if (error) { setStatus(error.message); toast('Could not create account.'); return; }
    if (data.session) await hydrateSession(data.user);
    else setStatus('Check your email to confirm the account, then sign in here.');
  };
  document.querySelector('#signIn').onclick = async () => {
    const email = document.querySelector('#emailInput').value.trim();
    const password = document.querySelector('#passwordInput').value;
    if (!email || !password) { toast('Enter your email and password to sign in.'); return; }
    setStatus('Signing in…');
    const { data, error } = await client.auth.signInWithPassword({email,password});
    if (error) { setStatus(error.message); toast('Sign in failed.'); return; }
    await hydrateSession(data.user);
  };
  const signOut = async () => {
    const { error } = await client.auth.signOut();
    if (error) toast('Could not sign out.');
    else { await hydrateSession(null); toast('Signed out of the realm.'); }
  };
  document.querySelector('#signOut').onclick = document.querySelector('#profileSignOut').onclick = signOut;
  document.querySelector('#searchBtn').onclick = searchPlayers;
  document.querySelector('#friendSearch').onkeydown = event => { if (event.key === 'Enter') searchPlayers(); };
  document.querySelectorAll('#scoreTabs .tab').forEach(button => button.addEventListener('click', () => setTimeout(refreshScores,0)));
  window.addEventListener('mooncap:save', queueSync);
  setInterval(queueSync, 30000);
  client.auth.onAuthStateChange((_event, session) => { queueMicrotask(() => hydrateSession(session?.user || null)); });
})();
