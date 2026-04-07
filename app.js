
(() => {
  const APP_TITLE = 'HALLILA';
  const APP_SUBTITLE = 'C KI KIA LA';
  const DEFAULT_ITEMS = ['Isaac', 'Liam', 'Ariel', 'Samuel', 'Nathan', 'Alex', 'Eitan', 'Gabriel', 'Adam', 'David'];
  const TIERS = ['S', 'A', 'B', 'C', 'D', 'E'];
  const TIER_POINTS = { S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 };
  const TIER_COLORS = { S: '#e65a5a', A: '#e6b751', B: '#cad157', C: '#7ec84f', D: '#83d8d9', E: '#9147d8' };
  const PLAYER_COLORS = [
    '#e65a5a', '#e6b751', '#83d8d9', '#7ec84f', '#cad157', '#6ea8ff', '#f07ac4', '#8b6df3',
    '#f08f5a', '#53d1a8', '#ff8fb1', '#9f8cff', '#00c2ff', '#00d084', '#ffb86b', '#ff6b6b',
    '#4dd4ac', '#74c0fc', '#ffd166', '#c77dff'
  ];
  const WAITING_PHRASES = [
    'Le jury délibère… mais sans café.',
    'On vérifie si tout le monde sait vraiment glisser-déposer.',
    'Les tiers list arrivent plus vite que les excuses.',
    'Un classement se prépare dans l’ombre.',
    'Les avis sont peut-être déjà en train de créer des dramas.',
    'Patience… la vérité statistique va bientôt tomber.',
    'On compte les votes, pas les mensonges.',
    'Le suspense est presque aussi grand que l’ego de certains.',
    'Analyse des chefs-d’œuvre en cours.',
    'Un podium est probablement en train de naître.'
  ];

  const HISTORY_KEY = 'hallila_history_v7';
  const ACTIVE_ROOM_PREFIX = 'hallila_live_room_v7_';
  const PLAYER_SESSION_PREFIX = 'hallila_player_session_v7_';
  const DRAFT_PREFIX = 'hallila_draft_v7_';
  const ROUND_MARK_PREFIX = 'hallila_round_mark_v1_';
  const SETS_KEY = 'hallila_item_sets_v1';
  const MUSIC_STORAGE_KEY = 'hallila_music_enabled_v1';
  const MUSIC_SRC = 'bg-music.wav';
  const USERS_KEY = 'hallila_accounts_users_v1';
  const CURRENT_USER_KEY = 'hallila_accounts_current_user_v1';
  const PERSONAS_KEY = 'hallila_accounts_personas_v1';
  const SUPABASE_CONFIG = window.HALLILA_SUPABASE_CONFIG || {};

  const SUPABASE_AUTH_REDIRECT = `${window.location.origin}${window.location.pathname}`;
  const AUTH_PLACEHOLDER_HASH = '__SUPABASE_AUTH__';
  const ROOM_STATE_TRANSITIONS = Object.freeze({
    lobby: ['ranking'],
    ranking: ['results', 'lobby'],
    results: ['lobby'],
    closed: []
  });

  const app = document.getElementById('app');
  let backgroundAudio = null;
  let musicUnlockBound = false;


  const state = {
    ui: {
      theme: '',
      historyTitle: '',
      themeMode: 'direct',
      joinPseudo: '',
      joinColor: PLAYER_COLORS[0],
      draggingItem: null,
      itemEditor: [...DEFAULT_ITEMS],
      itemEditorRoomId: null,
      newItemName: '',
      adminThemeBoxInput: '',
      playerThemeInput: '',
      waitingPhraseIndex: 0,
      waitingTicker: null,
      waitingContext: '',
      resultRevealRoomId: null,
      resultRevealPhase: 'full',
      resultTimer: null,
      notice: null,
      noticeTimer: null,
      editHistoryId: null,
      editHistoryValue: '',
      roomHistoryDraft: '',
      newSetName: '',
      selectedSetId: null,
      joinPreview: null,
      joinPreviewRoom: '',
      joinPreviewStatus: 'idle',
      joinPreviewError: '',
      touchDrag: null,
      authTab: 'register',
      authLoginEmail: '',
      authLoginPassword: '',
      authForgotEmail: '',
      authForgotPassword: '',
      authForgotConfirm: '',
      authRegisterName: '',
      authRegisterEmail: '',
      authRegisterPassword: '',
      authProfileColor: PLAYER_COLORS[0],
      authLinkMode: 'none',
      authPersonaId: '',
      authOtherName: '',
      authBoundUserId: null,
      joinAuthExpanded: false,
      joinResolvedRoomId: '',
      joinResolvedJoinId: '',
      adminRecoveryKey: '',
      adminRecoveryStatus: 'idle',
      adminRecoveryError: '',
      musicEnabled: (() => { try { const raw = localStorage.getItem(MUSIC_STORAGE_KEY); return raw === null ? true : JSON.parse(raw); } catch { return true; } })()
    },
    role: null,
    room: null,
    snapshot: null,
    playerSession: null,
    peer: null,
    hostConn: null,
    connections: {},
    previewPeer: null,
    previewConn: null,
    peerStatus: 'offline',
    peerError: '',
    account: null,
    db: { enabled: false, ready: false, syncing: false, error: '', lastSyncAt: null, timer: null, pendingKinds: new Set(), authListenerBound: false },
    playerReconnectAttempts: 0,
    playerReconnectTimer: null
  };

  const nowIso = () => new Date().toISOString();
  const activeRoomKey = (roomId) => `${ACTIVE_ROOM_PREFIX}${roomId}`;
  const playerSessionKey = (roomId) => `${PLAYER_SESSION_PREFIX}${roomId}`;
  const draftKey = (roomId, playerId) => `${DRAFT_PREFIX}${roomId}_${playerId}`;
  const roundMarkKey = (roomId, playerId) => `${ROUND_MARK_PREFIX}${roomId}_${playerId}`;

  function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeKey(key) {
    localStorage.removeItem(key);
  }

  function slugify(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || uid('slug');
  }

  function demoPasswordHash(value) {
    try {
      return btoa(unescape(encodeURIComponent(String(value || ''))));
    } catch {
      return String(value || '');
    }
  }

  function remoteAuthEnabled() {
    const client = dbClient();
    return !!(client && client.auth);
  }

  function authManagedPasswordHash() {
    return AUTH_PLACEHOLDER_HASH;
  }

  function upsertLocalUserRecord(user, persist = true) {
    if (!user) return null;
    const users = usersStore();
    const index = users.findIndex((entry) => entry.id === user.id || entry.email === user.email);
    if (index >= 0) users[index] = { ...users[index], ...user };
    else users.unshift(user);
    if (persist) saveUsers(users);
    else writeJson(USERS_KEY, users);
    return index >= 0 ? users[index] : users[0];
  }

  function rememberAuthenticatedUser(user, options = {}) {
    const persist = options.persist !== false;
    const shouldSetCurrent = options.setCurrent !== false;
    const stored = upsertLocalUserRecord(user, persist);
    if (shouldSetCurrent && stored?.id) setCurrentUserId(stored.id);
    state.account = stored || user || null;
    if (state.account) bindAuthUiFromUser(state.account);
    syncJoinDefaultsFromAccount();
    return state.account;
  }

  function usersStore() {
    return readJson(USERS_KEY, []);
  }

  function saveUsers(users) {
    writeJson(USERS_KEY, users);
    scheduleDbSync('accounts');
  }

  function personasStore() {
    return readJson(PERSONAS_KEY, []);
  }

  function savePersonas(personas) {
    writeJson(PERSONAS_KEY, personas);
    scheduleDbSync('personas');
  }

  function ensureAccountSeedData() {
    const personas = personasStore();
    if (!personas.length) {
      savePersonas(DEFAULT_ITEMS.map((name) => ({
        id: uid('persona'),
        name,
        slug: slugify(name),
        category: 'core',
        createdByUserId: null,
        claimedByUserId: null,
        isActive: true,
        createdAt: nowIso()
      })));
    }
  }

  function currentUserId() {
    return readJson(CURRENT_USER_KEY, null);
  }

  function setCurrentUserId(userId) {
    writeJson(CURRENT_USER_KEY, userId);
  }

  function clearCurrentUserId() {
    removeKey(CURRENT_USER_KEY);
  }

  function getCurrentUser() {
    const userId = currentUserId();
    if (!userId) return null;
    return usersStore().find((user) => user.id === userId) || null;
  }

  function activePersonas() {
    return personasStore().filter((persona) => persona.isActive !== false);
  }

  function corePersonas() {
    return activePersonas().filter((persona) => persona.category === 'core');
  }

  function otherPersonas() {
    return activePersonas().filter((persona) => persona.category === 'others');
  }

  function personaById(personaId) {
    return activePersonas().find((persona) => persona.id === personaId) || null;
  }

  function availableCorePersonas(forUserId = null) {
    return corePersonas().filter((persona) => !persona.claimedByUserId || persona.claimedByUserId === forUserId);
  }

  function bindAuthUiFromUser(user) {
    if (!user) return;
    if (state.ui.authBoundUserId === user.id) return;
    state.ui.authBoundUserId = user.id;
    state.ui.authRegisterName = user.displayName || '';
    state.ui.authRegisterEmail = user.email || '';
    state.ui.authRegisterPassword = '';
    state.ui.authProfileColor = user.profileColor || PLAYER_COLORS[0];
    state.ui.authLoginEmail = user.email || '';
    state.ui.authLoginPassword = '';
    state.ui.authForgotEmail = user.email || '';
    state.ui.authForgotPassword = '';
    state.ui.authForgotConfirm = '';
    const linkedPersona = personaById(user.linkedPersonaId);
    if (!linkedPersona) {
      state.ui.authLinkMode = 'none';
      state.ui.authPersonaId = '';
      state.ui.authOtherName = '';
    } else if (linkedPersona.category === 'core') {
      state.ui.authLinkMode = 'core';
      state.ui.authPersonaId = linkedPersona.id;
      state.ui.authOtherName = '';
    } else {
      state.ui.authLinkMode = 'other';
      state.ui.authPersonaId = '';
      state.ui.authOtherName = linkedPersona.name;
    }
  }

  function releaseClaimsForUser(personas, userId, exceptId = null) {
    personas.forEach((persona) => {
      if (persona.claimedByUserId === userId && persona.id !== exceptId) persona.claimedByUserId = null;
    });
  }

  function applyPersonaSelection(user, personas, mode, personaId, otherName) {
    const cleanMode = mode || 'none';
    if (cleanMode === 'none') {
      releaseClaimsForUser(personas, user.id, null);
      user.linkedPersonaId = null;
      return { ok: true, personas, user };
    }

    if (cleanMode === 'core') {
      const persona = personas.find((entry) => entry.id === personaId && entry.category === 'core' && entry.isActive !== false);
      if (!persona) return { ok: false, error: 'Choisis une persona du pack principal.' };
      if (persona.claimedByUserId && persona.claimedByUserId !== user.id) {
        return { ok: false, error: 'Cette persona est déjà liée à un autre compte.' };
      }
      releaseClaimsForUser(personas, user.id, persona.id);
      persona.claimedByUserId = user.id;
      user.linkedPersonaId = persona.id;
      return { ok: true, personas, user };
    }

    const cleanName = String(otherName || '').trim();
    if (!cleanName) return { ok: false, error: 'Entre ton nom pour la section Autres.' };
    let persona = personas.find((entry) => entry.category === 'others' && entry.createdByUserId === user.id && entry.isActive !== false);
    if (!persona) {
      persona = {
        id: uid('persona'),
        name: cleanName,
        slug: slugify(cleanName),
        category: 'others',
        createdByUserId: user.id,
        claimedByUserId: user.id,
        isActive: true,
        createdAt: nowIso()
      };
      personas.push(persona);
    } else {
      persona.name = cleanName;
      persona.slug = slugify(cleanName);
      persona.claimedByUserId = user.id;
      persona.isActive = true;
    }
    releaseClaimsForUser(personas, user.id, persona.id);
    user.linkedPersonaId = persona.id;
    return { ok: true, personas, user };
  }

  function syncJoinDefaultsFromAccount() {
    const user = getCurrentUser();
    state.account = user;
    if (!user) return;
    if (!String(state.ui.joinPseudo || '').trim()) state.ui.joinPseudo = user.displayName || '';
    if (PLAYER_COLORS.includes(user.profileColor)) state.ui.joinColor = user.profileColor;
  }


  async function createAccountFromUi() {
    ensureAccountSeedData();
    const displayName = String(state.ui.authRegisterName || '').trim();
    const email = String(state.ui.authRegisterEmail || '').trim().toLowerCase();
    const password = String(state.ui.authRegisterPassword || '');
    if (!displayName) return { ok: false, error: 'Entre un pseudo de compte.' };
    if (!email) return { ok: false, error: 'Entre un e-mail.' };
    if (password.length < 6) return { ok: false, error: 'Choisis un mot de passe de 6 caractères minimum.' };

    const personas = personasStore();
    const user = {
      id: uid('user'),
      email,
      passwordHash: remoteAuthEnabled() ? authManagedPasswordHash() : demoPasswordHash(password),
      displayName,
      profileColor: state.ui.authProfileColor || PLAYER_COLORS[0],
      linkedPersonaId: null,
      role: 'user',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const linkResult = applyPersonaSelection(user, personas, state.ui.authLinkMode, state.ui.authPersonaId, state.ui.authOtherName);
    if (!linkResult.ok) return linkResult;

    if (remoteAuthEnabled()) {
      const client = dbClient();
      const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } }
      });
      if (signUpError) return { ok: false, error: signUpError.message || 'Impossible de créer le compte en ligne.' };
      if (signUpData?.user?.id) user.id = signUpData.user.id;
      user.passwordHash = authManagedPasswordHash();
      const profileResponse = await client.from('users').upsert(mapLocalUserToDb(user), { onConflict: 'id' });
      if (profileResponse.error) return { ok: false, error: profileResponse.error.message || 'Compte créé, mais le profil n’a pas pu être synchronisé.' };
      savePersonas(personas);
      rememberAuthenticatedUser(user);
      return {
        ok: true,
        user,
        message: signUpData?.session ? 'Compte créé et connecté.' : 'Compte créé. Vérifie la configuration e-mail de Supabase Auth si tu veux imposer une confirmation.'
      };
    }

    const users = usersStore();
    if (users.some((entry) => entry.email === email)) return { ok: false, error: 'Un compte existe déjà avec cet e-mail.' };
    users.unshift(user);
    saveUsers(users);
    savePersonas(personas);
    setCurrentUserId(user.id);
    state.account = user;
    bindAuthUiFromUser(user);
    syncJoinDefaultsFromAccount();
    return { ok: true, user, message: 'Compte créé en mode local.' };
  }

  async function loginAccountFromUi() {
    const email = String(state.ui.authLoginEmail || '').trim().toLowerCase();
    const password = String(state.ui.authLoginPassword || '');
    if (!email || !password) return { ok: false, error: 'Entre ton e-mail et ton mot de passe.' };

    if (remoteAuthEnabled()) {
      const client = dbClient();
      const { error: authError } = await client.auth.signInWithPassword({ email, password });
      if (authError) return { ok: false, error: authError.message || 'Identifiants invalides.' };

      let user = null;
      const { data: row, error: rowError } = await client.from('users').select('*').eq('email', email).maybeSingle();
      if (rowError && rowError.code !== 'PGRST116') {
        return { ok: false, error: rowError.message || 'Connexion réussie, mais le profil n’a pas pu être chargé.' };
      }
      if (row) {
        user = mapDbUserToLocal(row);
      } else {
        const local = usersStore().find((entry) => entry.email === email) || null;
        user = local || {
          id: uid('user'),
          email,
          passwordHash: authManagedPasswordHash(),
          displayName: email.split('@')[0],
          profileColor: PLAYER_COLORS[0],
          linkedPersonaId: null,
          role: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        const upsertResponse = await client.from('users').upsert(mapLocalUserToDb(user), { onConflict: 'id' });
        if (upsertResponse.error) return { ok: false, error: upsertResponse.error.message || 'Connexion réussie, mais impossible d’initialiser le profil.' };
      }
      if (client.auth?.getUser) {
        const { data: authData } = await client.auth.getUser();
        if (authData?.user?.id) user.id = authData.user.id;
      }
      user.passwordHash = authManagedPasswordHash();
      rememberAuthenticatedUser(user);
      return { ok: true, user, message: 'Connexion en ligne réussie.' };
    }

    const user = usersStore().find((entry) => entry.email === email);
    if (!user || user.passwordHash !== demoPasswordHash(password)) {
      return { ok: false, error: 'Identifiants invalides.' };
    }
    setCurrentUserId(user.id);
    state.account = user;
    bindAuthUiFromUser(user);
    syncJoinDefaultsFromAccount();
    return { ok: true, user, message: 'Connexion réussie.' };
  }

  async function resetPasswordFromUi() {
    const email = String(state.ui.authForgotEmail || '').trim().toLowerCase();
    const password = String(state.ui.authForgotPassword || '');
    const confirm = String(state.ui.authForgotConfirm || '');
    if (!email) return { ok: false, error: 'Entre l’e-mail du compte.' };

    if (remoteAuthEnabled()) {
      const client = dbClient();
      const current = getCurrentUser();
      if (current?.email === email) {
        if (password.length < 6) return { ok: false, error: 'Choisis un nouveau mot de passe de 6 caractères minimum.' };
        if (password !== confirm) return { ok: false, error: 'Les deux mots de passe ne correspondent pas.' };
        const { error } = await client.auth.updateUser({ password });
        if (error) return { ok: false, error: error.message || 'Impossible de modifier le mot de passe.' };
        const users = usersStore();
        const localUser = users.find((entry) => entry.id === current.id || entry.email === email);
        if (localUser) {
          localUser.passwordHash = authManagedPasswordHash();
          localUser.updatedAt = nowIso();
          saveUsers(users);
        }
        state.ui.authLoginEmail = email;
        state.ui.authLoginPassword = '';
        state.ui.authForgotPassword = '';
        state.ui.authForgotConfirm = '';
        state.ui.authTab = 'login';
        return { ok: true, message: 'Mot de passe mis à jour.' };
      }

      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: SUPABASE_AUTH_REDIRECT });
      if (error) return { ok: false, error: error.message || 'Impossible d’envoyer l’e-mail de réinitialisation.' };
      state.ui.authLoginEmail = email;
      state.ui.authLoginPassword = '';
      state.ui.authForgotPassword = '';
      state.ui.authForgotConfirm = '';
      state.ui.authTab = 'login';
      return { ok: true, message: 'Un e-mail de réinitialisation a été envoyé.' };
    }

    const users = usersStore();
    const user = users.find((entry) => entry.email === email);
    if (!user) return { ok: false, error: 'Aucun compte trouvé avec cet e-mail.' };
    if (password.length < 6) return { ok: false, error: 'Choisis un nouveau mot de passe de 6 caractères minimum.' };
    if (password !== confirm) return { ok: false, error: 'Les deux mots de passe ne correspondent pas.' };
    user.passwordHash = demoPasswordHash(password);
    user.updatedAt = nowIso();
    saveUsers(users);
    state.ui.authLoginEmail = email;
    state.ui.authLoginPassword = '';
    state.ui.authForgotPassword = '';
    state.ui.authForgotConfirm = '';
    state.ui.authTab = 'login';
    return { ok: true, user, message: 'Mot de passe réinitialisé.' };
  }

  async function logoutAccount() {
    if (remoteAuthEnabled()) {
      try { await dbClient().auth.signOut(); } catch {}
    }
    clearCurrentUserId();
    state.account = null;
    state.ui.authBoundUserId = null;
    state.ui.joinPseudo = '';
    state.ui.joinColor = PLAYER_COLORS[0];
  }

  async function updateAccountFromUi() {
    const current = getCurrentUser();
    if (!current) return { ok: false, error: 'Aucun compte connecté.' };
    const users = usersStore();
    const user = users.find((entry) => entry.id === current.id) || current;
    const displayName = String(state.ui.authRegisterName || '').trim();
    if (!displayName) return { ok: false, error: 'Entre un pseudo de compte.' };
    user.displayName = displayName;
    user.profileColor = state.ui.authProfileColor || PLAYER_COLORS[0];
    user.updatedAt = nowIso();
    if (remoteAuthEnabled()) user.passwordHash = authManagedPasswordHash();
    const personas = personasStore();
    const linkResult = applyPersonaSelection(user, personas, state.ui.authLinkMode, state.ui.authPersonaId, state.ui.authOtherName);
    if (!linkResult.ok) return linkResult;
    if (users.some((entry) => entry.id === user.id)) saveUsers(users);
    else saveUsers([user, ...users]);
    savePersonas(personas);
    if (remoteAuthEnabled()) {
      const response = await dbClient().from('users').upsert(mapLocalUserToDb(user), { onConflict: 'id' });
      if (response.error) return { ok: false, error: response.error.message || 'Profil enregistré localement, mais pas en ligne.' };
    }
    state.account = user;
    bindAuthUiFromUser(user);
    syncJoinDefaultsFromAccount();
    return { ok: true, user };
  }

  function userHistoryEntries(user) {
    if (!user) return [];
    return historyStore().filter((entry) => entry.hostUserId === user.id || (entry.participants || []).some((participant) => participant.userId === user.id));
  }

  function personaStatsForUser(user) {
    if (!user || !user.linkedPersonaId) return null;
    const persona = personaById(user.linkedPersonaId);
    if (!persona) return null;
    const relevant = historyStore()
      .map((entry) => ({ entry, result: (entry.results || []).find((item) => item.name === persona.name) }))
      .filter((item) => item.result);
    if (!relevant.length) {
      return { persona, count: 0, avgScore: 0, best: null, worst: null, distribution: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 } };
    }
    const distribution = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    let sum = 0;
    let best = relevant[0].result;
    let worst = relevant[0].result;
    relevant.forEach(({ result }) => {
      sum += Number(result.score || 0);
      distribution[result.finalTier] += 1;
      if (Number(result.score || 0) > Number(best.score || 0)) best = result;
      if (Number(result.score || 0) < Number(worst.score || 0)) worst = result;
    });
    return {
      persona,
      count: relevant.length,
      avgScore: Number((sum / relevant.length).toFixed(2)),
      best,
      worst,
      distribution
    };
  }

  function accountBadge() {
    const user = getCurrentUser();
    if (!user) return `<div class="footer-note">Aucun compte connecté.</div>`;
    const persona = personaById(user.linkedPersonaId);
    return `<div class="account-badge"><strong>${escapeHtml(user.displayName)}</strong>${persona ? `<span class="tag small">Persona : ${escapeHtml(persona.name)} · ${persona.category === 'core' ? 'Pack principal' : 'Autres'}</span>` : '<span class="tag small">Aucune persona liée</span>'}</div>`;
  }

  function accountSummaryMarkup(user) {
    const persona = personaById(user?.linkedPersonaId);
    return `
      <div class="card" style="display:grid;gap:12px;">
        <div class="label-top">Compte</div>
        <div style="font-size:clamp(24px,2.8vw,38px);font-weight:800;">${escapeHtml(user?.displayName || '')}</div>
        <div class="subtle">${escapeHtml(dbStatusLabel())}${state.db.lastSyncAt ? ` · ${escapeHtml(formatDate(state.db.lastSyncAt))}` : ""}</div>
        <div class="row">
          <span class="tag">Couleur favorite</span>
          <span class="color-pill" style="background:${escapeHtml(user?.profileColor || PLAYER_COLORS[0])}"></span>
        </div>
        <div class="subtle">${persona ? `Persona liée : ${escapeHtml(persona.name)} (${persona.category === 'core' ? 'pack principal' : 'autres'})` : 'Aucune persona liée pour le moment.'}</div>
      </div>
    `;
  }

function dbClient() {
  if (state.db._resolved) return state.db.client || null;
  state.db._resolved = true;
  try {
    if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
      state.db.client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      state.db.enabled = true;
    } else {
      state.db.client = null;
      state.db.enabled = false;
    }
  } catch (error) {
    state.db.client = null;
    state.db.enabled = false;
    state.db.error = error?.message || 'Erreur Supabase';
  }
  return state.db.client || null;
}

function dbStatusLabel() {
  if (!state.db.enabled) return 'Mode local';
  if (state.db.syncing) return 'Sync BDD…';
  if (state.db.pendingKinds?.size) return 'Sync en attente';
  if (state.db.error) return 'Erreur BDD';
  if (state.db.ready) return 'BDD liée';
  return 'Connexion BDD';
}

function cloneRoomForStorage(room) {
  return JSON.parse(JSON.stringify(room || null));
}

function hydrateRoomPayload(rawRoom, roomId = null) {
  if (!rawRoom || typeof rawRoom !== 'object') return null;
  const room = cloneRoomForStorage(rawRoom);
  room.id = room.id || roomId || uid('room');
  room.adminToken = room.adminToken || uid('admin');
  room.joinToken = room.joinToken || room.publicJoinToken || room.id;
  room.themeMode = room.themeMode || 'direct';
  room.items = normalizeItems(room.items || DEFAULT_ITEMS);
  room.themeBox = Array.isArray(room.themeBox) ? room.themeBox : [];
  room.rankings = room.rankings || {};
  room.feedback = room.feedback || {};
  room.players = Array.isArray(room.players) ? room.players : [];
  room.finalResults = Array.isArray(room.finalResults) ? room.finalResults : [];
  room.usedThemeIds = Array.isArray(room.usedThemeIds) ? room.usedThemeIds : [];
  room.roundId = room.roundId || `round_${room.id}`;
  room.roundNumber = Number(room.roundNumber || 1);
  room.currentHistoryId = room.currentHistoryId || null;
  room.status = room.status || 'lobby';
  room.startedAt = room.startedAt || null;
  room.completedAt = room.completedAt || null;
  return room;
}

async function syncCurrentUserFromRemoteSession() {
  if (!remoteAuthEnabled()) return;
  const client = dbClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const authUser = data?.session?.user;
  if (!authUser?.email) return;
  let user = usersStore().find((entry) => entry.id === authUser.id || entry.email === String(authUser.email).toLowerCase()) || null;
  if (!user) {
    const response = await client.from('users').select('*').eq('id', authUser.id).maybeSingle();
    if (response.error && response.error.code !== 'PGRST116') throw response.error;
    if (response.data) user = mapDbUserToLocal(response.data);
  }
  if (!user) {
    user = {
      id: authUser.id,
      email: String(authUser.email).toLowerCase(),
      passwordHash: authManagedPasswordHash(),
      displayName: authUser.user_metadata?.display_name || String(authUser.email).split('@')[0],
      profileColor: PLAYER_COLORS[0],
      linkedPersonaId: null,
      role: 'user',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }
  user.id = authUser.id;
  user.email = String(authUser.email).toLowerCase();
  user.passwordHash = authManagedPasswordHash();
  rememberAuthenticatedUser(user, { persist: false });
}

function bindRemoteAuthListener() {
  if (!remoteAuthEnabled() || state.db.authListenerBound) return;
  state.db.authListenerBound = true;
  dbClient().auth.onAuthStateChange(async (_event, session) => {
    try {
      if (session?.user?.email) {
        await syncCurrentUserFromRemoteSession();
      } else if (state.account) {
        clearCurrentUserId();
        state.account = null;
        state.ui.authBoundUserId = null;
      }
    } catch (error) {
      state.db.error = error?.message || 'Erreur de session';
    } finally {
      render();
    }
  });
}

function mapLocalUserToDb(user) {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    profile_color: user.profileColor || null,
    linked_persona_id: user.linkedPersonaId || null,
    role: user.role || 'user',
    created_at: user.createdAt || nowIso(),
    updated_at: user.updatedAt || nowIso()
  };
}

function mapDbUserToLocal(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    profileColor: row.profile_color || PLAYER_COLORS[0],
    linkedPersonaId: row.linked_persona_id || null,
    role: row.role || 'user',
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || nowIso()
  };
}

function mapLocalPersonaToDb(persona) {
  return {
    id: persona.id,
    name: persona.name,
    slug: persona.slug || slugify(persona.name),
    category: persona.category || 'others',
    created_by_user_id: persona.createdByUserId || null,
    claimed_by_user_id: persona.claimedByUserId || null,
    is_claimable: persona.isClaimable !== false,
    is_active: persona.isActive !== false,
    created_at: persona.createdAt || nowIso()
  };
}

function mapDbPersonaToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    createdByUserId: row.created_by_user_id || null,
    claimedByUserId: row.claimed_by_user_id || null,
    isClaimable: row.is_claimable !== false,
    isActive: row.is_active !== false,
    createdAt: row.created_at || nowIso()
  };
}

function mapHistoryRowToLocal(row) {
  const snap = row.snapshot_json || {};
  return {
    id: row.id,
    roomId: row.game_id,
    roundId: row.round_id,
    roundNumber: snap.roundNumber || 1,
    title: row.title,
    theme: row.theme_text || snap.theme || '',
    playersCount: row.players_count || 0,
    completedAt: row.completed_at || row.created_at || nowIso(),
    results: snap.results || snap.finalResults || [],
    hostUserId: row.created_by_user_id || snap.hostUserId || null,
    hostDisplayName: snap.hostDisplayName || null,
    participants: snap.participants || []
  };
}

function ensurePersonasForNames(names, ownerUserId = null) {
  const personas = personasStore();
  let changed = false;
  names.forEach((name) => {
    const slug = slugify(name);
    if (!personas.some((persona) => persona.slug === slug)) {
      personas.push({
        id: uid('persona'),
        name,
        slug,
        category: DEFAULT_ITEMS.some((entry) => entry.toLowerCase() === String(name).toLowerCase()) ? 'core' : 'others',
        createdByUserId: ownerUserId || null,
        claimedByUserId: null,
        isClaimable: true,
        isActive: true,
        createdAt: nowIso()
      });
      changed = true;
    }
  });
  if (changed) savePersonas(personas);
  return personas;
}

async function dbFetchCoreData() {
  const client = dbClient();
  if (!client) return;
  const [{ data: usersRows, error: usersError }, { data: personaRows, error: personaError }, { data: setRows, error: setError }, { data: setItemRows, error: setItemError }, { data: historyRows, error: historyError }] = await Promise.all([
    client.from('users').select('*').order('created_at', { ascending: true }),
    client.from('personas').select('*').order('created_at', { ascending: true }),
    client.from('persona_sets').select('*').order('created_at', { ascending: true }),
    client.from('persona_set_items').select('*').order('display_order', { ascending: true }),
    client.from('history_entries').select('*').order('completed_at', { ascending: false }).limit(200)
  ]);
  if (usersError) throw usersError;
  if (personaError) throw personaError;
  if (setError) throw setError;
  if (setItemError) throw setItemError;
  if (historyError) throw historyError;
  if (Array.isArray(usersRows) && usersRows.length) writeJson(USERS_KEY, usersRows.map(mapDbUserToLocal));
  if (Array.isArray(personaRows) && personaRows.length) writeJson(PERSONAS_KEY, personaRows.map(mapDbPersonaToLocal));
  if (Array.isArray(setRows)) {
    const personas = personaRows && personaRows.length ? personaRows.map(mapDbPersonaToLocal) : personasStore();
    const byId = new Map(personas.map((persona) => [persona.id, persona]));
    const grouped = new Map();
    (setItemRows || []).forEach((row) => {
      if (!grouped.has(row.set_id)) grouped.set(row.set_id, []);
      grouped.get(row.set_id).push(row);
    });
    const localSets = setRows.map((setRow) => ({
      id: setRow.id,
      name: setRow.name,
      description: setRow.description || '',
      visibility: setRow.visibility || 'private',
      isDefaultCore: !!setRow.is_default_core,
      ownerUserId: setRow.owner_user_id || null,
      items: (grouped.get(setRow.id) || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map((itemRow) => byId.get(itemRow.persona_id)?.name)
        .filter(Boolean)
    }));
    writeJson(SETS_KEY, localSets);
  }
  if (Array.isArray(historyRows) && historyRows.length) {
    writeJson(HISTORY_KEY, historyRows.map(mapHistoryRowToLocal));
  }
  const current = getCurrentUser();
  state.account = current;
  if (current) bindAuthUiFromUser(current);
  syncJoinDefaultsFromAccount();
}

async function dbSyncUsers() {
  const client = dbClient();
  if (!client) return;
  const users = usersStore();
  if (!users.length) return;
  const { error } = await client.from('users').upsert(users.map(mapLocalUserToDb), { onConflict: 'id' });
  if (error) throw error;
}

async function dbSyncPersonas() {
  const client = dbClient();
  if (!client) return;
  const personas = personasStore();
  if (!personas.length) return;
  const { error } = await client.from('personas').upsert(personas.map(mapLocalPersonaToDb), { onConflict: 'id' });
  if (error) throw error;
}

async function dbSyncSets() {
  const client = dbClient();
  if (!client) return;
  const account = getCurrentUser();
  const sets = itemSetsStore();
  if (!sets.length) return;
  ensurePersonasForNames(sets.flatMap((set) => set.items || []), account?.id || null);
  await dbSyncPersonas();
  const personas = personasStore();
  const bySlug = new Map(personas.map((persona) => [persona.slug, persona]));
  const setRows = sets.map((set) => ({
    id: set.id,
    name: set.name,
    description: set.description || null,
    owner_user_id: set.ownerUserId || account?.id || null,
    visibility: set.visibility || 'private',
    is_default_core: !!set.isDefaultCore,
    created_at: set.createdAt || nowIso()
  }));
  let response = await client.from('persona_sets').upsert(setRows, { onConflict: 'id' });
  if (response.error) throw response.error;
  const setIds = sets.map((set) => set.id);
  if (setIds.length) {
    response = await client.from('persona_set_items').delete().in('set_id', setIds);
    if (response.error) throw response.error;
  }
  const itemRows = [];
  sets.forEach((set) => {
    (set.items || []).forEach((name, index) => {
      const persona = bySlug.get(slugify(name));
      if (!persona) return;
      itemRows.push({ id: uid('set_item'), set_id: set.id, persona_id: persona.id, display_order: index });
    });
  });
  if (itemRows.length) {
    response = await client.from('persona_set_items').insert(itemRows);
    if (response.error) throw response.error;
  }
}

async function dbSyncRoom(room) {
  const client = dbClient();
  if (!client || !room) return;
  ensurePersonasForNames(room.items || [], room.hostUserId || null);
  await dbSyncPersonas();
  const personas = personasStore();
  const bySlug = new Map(personas.map((persona) => [persona.slug, persona]));
  let response = await client.from('games').upsert({
    id: room.id,
    admin_token: room.adminToken || null,
    public_join_token: room.joinToken || room.id,
    live_state_json: cloneRoomForStorage(room),
    host_user_id: room.hostUserId || null,
    title: room.historyTitle || null,
    theme_mode: room.themeMode === 'box' ? 'idea_box' : 'manual',
    theme_text: room.theme || null,
    status: room.status || 'lobby',
    set_id: room.setId || null,
    allow_others: true,
    allow_likes: true,
    created_at: room.createdAt || nowIso(),
    started_at: room.status && room.status !== 'lobby' ? (room.startedAt || room.updatedAt || nowIso()) : null,
    ended_at: room.completedAt || null
  }, { onConflict: 'id' });
  if (response.error) throw response.error;

  response = await client.from('game_rounds').upsert({
    id: room.roundId,
    game_id: room.id,
    round_number: room.roundNumber || 1,
    theme_mode: room.themeMode === 'box' ? 'idea_box' : 'manual',
    theme_text: room.theme || null,
    status: room.status === 'closed' ? 'results' : (room.status || 'lobby'),
    created_at: room.createdAt || nowIso(),
    started_at: room.status && room.status !== 'lobby' ? (room.startedAt || room.updatedAt || nowIso()) : null,
    ended_at: room.completedAt || null
  }, { onConflict: 'id' });
  if (response.error) throw response.error;

  const playerRows = [];
  if (room.hostPlayerId || room.hostUserId) {
    playerRows.push({
      id: room.hostPlayerId || uid('host_player'),
      game_id: room.id,
      user_id: room.hostUserId || null,
      guest_name: null,
      player_name: room.hostDisplayName || 'Admin',
      selected_color: room.hostProfileColor || null,
      linked_persona_id: room.hostLinkedPersonaId || null,
      is_host: true,
      joined_at: room.createdAt || nowIso(),
      submitted_at: null,
      is_connected: true
    });
  }
  room.players.forEach((player) => {
    playerRows.push({
      id: player.id,
      game_id: room.id,
      user_id: player.userId || null,
      guest_name: player.userId ? null : player.pseudo,
      player_name: player.pseudo,
      selected_color: player.color,
      linked_persona_id: player.linkedPersonaId || null,
      is_host: false,
      joined_at: player.joinedAt || nowIso(),
      submitted_at: player.submittedAt || null,
      is_connected: !!player.connected
    });
  });
  if (playerRows.length) {
    response = await client.from('game_players').upsert(playerRows, { onConflict: 'id' });
    if (response.error) throw response.error;
  }

  response = await client.from('idea_box_entries').delete().eq('game_id', room.id);
  if (response.error) throw response.error;
  const ideaRows = (room.themeBox || []).map((entry) => ({
    id: entry.id,
    game_id: room.id,
    round_id: room.roundId,
    submitted_by_player_id: entry.playerId,
    theme_text: entry.text,
    is_used: (room.usedThemeIds || []).includes(entry.id),
    used_in_round_id: (room.usedThemeIds || []).includes(entry.id) ? room.roundId : null,
    created_at: nowIso()
  }));
  if (ideaRows.length) {
    response = await client.from('idea_box_entries').insert(ideaRows);
    if (response.error) throw response.error;
  }

  response = await client.from('player_rankings').delete().eq('round_id', room.roundId);
  if (response.error) throw response.error;
  const rankingRows = [];
  Object.entries(room.rankings || {}).forEach(([playerId, ranking]) => {
    Object.entries(ranking || {}).forEach(([name, tier]) => {
      const persona = bySlug.get(slugify(name));
      if (!persona) return;
      rankingRows.push({
        game_id: room.id,
        round_id: room.roundId,
        player_id: playerId,
        persona_id: persona.id,
        tier,
        score_value: TIER_POINTS[tier] || 0,
        updated_at: nowIso()
      });
    });
  });
  if (rankingRows.length) {
    response = await client.from('player_rankings').upsert(rankingRows, { onConflict: 'round_id,player_id,persona_id' });
    if (response.error) throw response.error;
  }

  response = await client.from('round_results').delete().eq('round_id', room.roundId);
  if (response.error) throw response.error;
  const resultRows = (room.finalResults || []).map((result, index) => {
    const persona = bySlug.get(slugify(result.name));
    if (!persona) return null;
    return {
      game_id: room.id,
      round_id: room.roundId,
      persona_id: persona.id,
      total_points: result.sum || 0,
      average_score: result.averagePoints || 0,
      score_percent: result.score || 0,
      final_tier: result.finalTier || 'E',
      rank_position: index + 1
    };
  }).filter(Boolean);
  if (resultRows.length) {
    response = await client.from('round_results').upsert(resultRows, { onConflict: 'round_id,persona_id' });
    if (response.error) throw response.error;
  }

  response = await client.from('round_reactions').delete().eq('round_id', room.roundId);
  if (response.error) throw response.error;
  const reactionRows = Object.entries(room.feedback || {}).filter(([, value]) => value === 'like' || value === 'dislike').map(([playerId, value]) => ({
    round_id: room.roundId,
    player_id: playerId,
    reaction_type: value,
    created_at: nowIso()
  }));
  if (reactionRows.length) {
    response = await client.from('round_reactions').upsert(reactionRows, { onConflict: 'round_id,player_id' });
    if (response.error) throw response.error;
  }

  if (room.status === 'results' && room.currentHistoryId) {
    response = await client.from('history_entries').upsert({
      id: room.currentHistoryId,
      game_id: room.id,
      round_id: room.roundId,
      title: room.historyTitle || `Résultat — ${room.theme}`,
      theme_text: room.theme || null,
      players_count: room.players.length,
      created_by_user_id: room.hostUserId || null,
      created_at: room.createdAt || nowIso(),
      completed_at: room.completedAt || nowIso(),
      snapshot_json: {
        results: room.finalResults || [],
        participants: room.players.map((player) => ({
          playerId: player.id,
          pseudo: player.pseudo,
          userId: player.userId || null,
          accountDisplayName: player.accountDisplayName || null,
          linkedPersonaId: player.linkedPersonaId || null,
          linkedPersonaName: player.linkedPersonaName || null
        })),
        roundNumber: room.roundNumber || 1,
        theme: room.theme || '',
        hostUserId: room.hostUserId || null,
        hostDisplayName: room.hostDisplayName || null
      }
    }, { onConflict: 'id' });
    if (response.error) throw response.error;
    response = await client.from('history_entry_players').delete().eq('history_entry_id', room.currentHistoryId);
    if (response.error) throw response.error;
    const entryPlayers = room.players.map((player) => ({
      id: uid('history_player'),
      history_entry_id: room.currentHistoryId,
      player_id: player.id,
      user_id: player.userId || null,
      is_host: false
    }));
    if (room.hostPlayerId || room.hostUserId) {
      entryPlayers.push({
        id: uid('history_player'),
        history_entry_id: room.currentHistoryId,
        player_id: room.hostPlayerId || uid('host_player_link'),
        user_id: room.hostUserId || null,
        is_host: true
      });
    }
    if (entryPlayers.length) {
      response = await client.from('history_entry_players').insert(entryPlayers);
      if (response.error) throw response.error;
    }
  }
}

function scheduleDbSync(kind = 'all') {
  const client = dbClient();
  if (!client) return;
  state.db.pendingKinds.add(kind);
  if (state.db.timer) clearTimeout(state.db.timer);
  state.db.timer = setTimeout(async () => {
    state.db.syncing = true;
    state.db.error = '';
    render();
    try {
      await dbSyncUsers();
      await dbSyncPersonas();
      await dbSyncSets();
      if (state.role === 'admin' && state.room) await dbSyncRoom(state.room);
      await dbFetchCoreData();
      state.db.lastSyncAt = nowIso();
      state.db.ready = true;
      state.db.pendingKinds.clear();
    } catch (error) {
      state.db.error = error?.message || 'Erreur de synchronisation BDD';
    } finally {
      state.db.syncing = false;
      render();
    }
  }, kind === 'room' ? 250 : 600);
}

async function dbBootstrap() {
  const client = dbClient();
  if (!client) {
    state.db.ready = false;
    render();
    return;
  }
  state.db.syncing = true;
  render();
  try {
    bindRemoteAuthListener();
    await syncCurrentUserFromRemoteSession();
    await dbFetchCoreData();
    state.db.ready = true;
    state.db.error = '';
    state.db.lastSyncAt = nowIso();
  } catch (error) {
    state.db.error = error?.message || 'Erreur BDD';
  } finally {
    state.db.syncing = false;
    render();
  }
}


  function ensureBackgroundAudio() {
    if (backgroundAudio) return backgroundAudio;
    backgroundAudio = new Audio(MUSIC_SRC);
    backgroundAudio.loop = true;
    backgroundAudio.preload = 'auto';
    backgroundAudio.volume = 0.42;
    return backgroundAudio;
  }

  function persistMusicPreference() {
    try {
      localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(!!state.ui.musicEnabled));
    } catch {}
  }

  function tryStartMusic() {
    if (!state.ui.musicEnabled) return;
    const audio = ensureBackgroundAudio();
    if (!audio.paused) return;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function pauseMusic() {
    if (!backgroundAudio) return;
    try { backgroundAudio.pause(); } catch {}
  }

  function toggleMusic() {
    state.ui.musicEnabled = !state.ui.musicEnabled;
    persistMusicPreference();
    if (state.ui.musicEnabled) tryStartMusic();
    else pauseMusic();
    render();
  }

  function setupMusicUnlock() {
    if (musicUnlockBound) return;
    musicUnlockBound = true;
    const unlock = () => {
      if (state.ui.musicEnabled) tryStartMusic();
    };
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
  }


  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function itemSetsStore() {
    return readJson(SETS_KEY, []);
  }

  function saveItemSets(sets) {
    writeJson(SETS_KEY, sets);
    scheduleDbSync('sets');
  }

  function setNotice(text, tone = 'warn', timeout = 3200) {
    state.ui.notice = { text, tone };
    if (state.ui.noticeTimer) clearTimeout(state.ui.noticeTimer);
    if (timeout) {
      state.ui.noticeTimer = setTimeout(() => {
        state.ui.notice = null;
        render();
      }, timeout);
    }
    render();
  }

  function clearNotice() {
    state.ui.notice = null;
    if (state.ui.noticeTimer) {
      clearTimeout(state.ui.noticeTimer);
      state.ui.noticeTimer = null;
    }
  }

  function usedColors(source) {
    return new Set(((source?.players) || []).map((player) => player.color));
  }

  function feedbackSummary(source, playerId = null) {
    const feedback = source?.feedback || {};
    let likes = 0;
    let dislikes = 0;
    Object.values(feedback).forEach((value) => {
      if (value === 'like') likes += 1;
      if (value === 'dislike') dislikes += 1;
    });
    return {
      likes,
      dislikes,
      mine: playerId ? (feedback[playerId] || 'none') : 'none'
    };
  }

  function cleanupJoinPreview() {
    if (state.previewConn) {
      try { state.previewConn.close(); } catch {}
      state.previewConn = null;
    }
    if (state.previewPeer) {
      try { state.previewPeer.destroy(); } catch {}
      state.previewPeer = null;
    }
  }

  async function ensureJoinPreview(joinId) {
    if (!joinId) return;
    if (state.ui.joinPreviewRoom === joinId && (state.ui.joinPreviewStatus === 'connecting' || state.ui.joinPreviewStatus === 'ready')) return;
    cleanupJoinPreview();
    state.ui.joinPreviewRoom = joinId;
    state.ui.joinPreviewStatus = 'connecting';
    state.ui.joinPreviewError = '';
    state.ui.joinPreview = null;
    state.ui.joinResolvedRoomId = '';
    state.ui.joinResolvedJoinId = joinId;
    render();

    let resolvedRoom = null;
    try {
      resolvedRoom = await resolveJoinRoom(joinId);
    } catch (error) {
      if (state.ui.joinPreviewRoom !== joinId) return;
      state.ui.joinPreviewStatus = 'error';
      state.ui.joinPreviewError = error?.message || 'Impossible de vérifier la salle.';
      render();
      return;
    }

    if (state.ui.joinPreviewRoom !== joinId) return;
    if (!resolvedRoom) {
      state.ui.joinPreviewStatus = 'error';
      state.ui.joinPreviewError = 'Salle introuvable via ce lien.';
      render();
      return;
    }

    state.ui.joinResolvedRoomId = resolvedRoom.id;
    state.ui.joinPreview = publicSnapshot(resolvedRoom);
    state.ui.joinPreviewStatus = 'ready';
    state.ui.joinPreviewError = '';
    render();

    if (!window.Peer) return;
    const peer = new Peer(uid('hallila_preview'));
    state.previewPeer = peer;
    peer.on('open', () => {
      const conn = peer.connect(resolvedRoom.id, { reliable: true });
      state.previewConn = conn;
      conn.on('open', () => conn.send({ type: 'peek' }));
      conn.on('data', (message) => {
        if (state.ui.joinPreviewRoom !== joinId) return;
        if (message?.type === 'snapshot') {
          state.ui.joinPreview = message.room;
          state.ui.joinResolvedRoomId = message.room?.id || resolvedRoom.id;
          state.ui.joinPreviewStatus = 'ready';
          state.ui.joinPreviewError = '';
          render();
          setTimeout(() => cleanupJoinPreview(), 60);
        }
      });
      conn.on('error', () => {
        if (state.ui.joinPreviewRoom !== joinId) return;
        if (!state.ui.joinPreview) {
          state.ui.joinPreviewStatus = 'error';
          state.ui.joinPreviewError = 'Salle indisponible.';
          render();
        }
      });
    });
    peer.on('error', () => {
      if (state.ui.joinPreviewRoom !== joinId) return;
      if (!state.ui.joinPreview) {
        state.ui.joinPreviewStatus = 'error';
        state.ui.joinPreviewError = 'Salle indisponible.';
        render();
      }
    });
  }

  function saveCurrentItemsAsSet() {
    const items = normalizeItems(state.ui.itemEditor);
    const name = String(state.ui.newSetName || '').trim();
    if (!name) {
      setNotice('Donne un nom au set.', 'warn');
      return;
    }
    if (items.length < 2) {
      setNotice('Il faut au moins 2 noms dans un set.', 'warn');
      return;
    }
    const sets = itemSetsStore();
    const existing = state.ui.selectedSetId ? sets.find((entry) => entry.id === state.ui.selectedSetId) : sets.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.name = name;
      existing.items = items;
      state.ui.selectedSetId = existing.id;
      setNotice('Set mis à jour.', 'ok');
    } else {
      const created = { id: uid('set'), name, items };
      sets.unshift(created);
      state.ui.selectedSetId = created.id;
      setNotice('Set enregistré.', 'ok');
    }
    saveItemSets(sets);
    render();
  }

  function loadSetIntoEditor(setId) {
    const set = itemSetsStore().find((entry) => entry.id === setId);
    if (!set) return;
    state.ui.selectedSetId = set.id;
    state.ui.newSetName = set.name;
    state.ui.itemEditor = [...set.items];
    render();
  }

  function deleteItemSet(setId) {
    const sets = itemSetsStore().filter((entry) => entry.id !== setId);
    saveItemSets(sets);
    if (state.ui.selectedSetId === setId) {
      state.ui.selectedSetId = null;
      state.ui.newSetName = '';
    }
    setNotice('Set supprimé.', 'ok');
  }

  function sendFeedbackVote(value) {
    const route = getRoute();
    if (!state.hostConn || !state.hostConn.open || !route.playerId) {
      setNotice('Connexion avec l’admin perdue.', 'bad');
      return;
    }
    state.hostConn.send({ type: 'feedback', playerId: route.playerId, value });
  }

  function getRoute() {
    const params = new URLSearchParams(window.location.search);
    return {
      roomId: params.get('room'),
      joinId: params.get('join'),
      playerId: params.get('player'),
      adminToken: params.get('admin'),
      themeHint: params.get('theme') || '',
      hash: window.location.hash || ''
    };
  }

  function setRoute(params = {}, hash = '') {
    const url = new URL(window.location.href);
    url.search = '';
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    url.hash = hash || '';
    history.replaceState({}, '', url.toString());
  }

  function historyStore() {
    return readJson(HISTORY_KEY, []);
  }

  function loadActiveRoom(roomId) {
    const room = readJson(activeRoomKey(roomId), null);
    return hydrateRoomPayload(room, roomId);
  }

  function localRoomsStore() {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(ACTIVE_ROOM_PREFIX));
    return keys.map((key) => {
      const roomId = key.replace(ACTIVE_ROOM_PREFIX, '');
      return hydrateRoomPayload(readJson(key, null), roomId);
    }).filter(Boolean);
  }

  function findLocalRoomByJoinId(joinId) {
    if (!joinId) return null;
    if (state.room && (state.room.id === joinId || state.room.joinToken === joinId)) return hydrateRoomPayload(state.room, state.room.id);
    return localRoomsStore().find((room) => room.id === joinId || room.joinToken === joinId) || null;
  }

  async function dbResolveJoinRoom(joinId) {
    const client = dbClient();
    if (!client || !joinId) return null;
    const filters = [`id.eq.${joinId}`];
    filters.push(`public_join_token.eq.${joinId}`);
    const response = await client
      .from('games')
      .select('id, public_join_token, live_state_json, host_user_id, theme_mode, theme_text, status')
      .or(filters.join(','))
      .maybeSingle();
    if (response.error && response.error.code !== 'PGRST116') throw response.error;
    if (!response.data) return null;
    const room = hydrateRoomPayload(response.data.live_state_json || {}, response.data.id);
    if (response.data.public_join_token) room.joinToken = response.data.public_join_token;
    if (!room.hostUserId) room.hostUserId = response.data.host_user_id || null;
    if (!room.themeMode) room.themeMode = response.data.theme_mode === 'idea_box' ? 'box' : 'direct';
    if (!room.theme) room.theme = response.data.theme_text || '';
    if (!room.status) room.status = response.data.status || 'lobby';
    return room;
  }

  async function resolveJoinRoom(joinId) {
    const local = findLocalRoomByJoinId(joinId);
    if (local) return local;
    return await dbResolveJoinRoom(joinId);
  }

  function saveActiveRoom(room) {
    room.updatedAt = nowIso();
    writeJson(activeRoomKey(room.id), cloneRoomForStorage(room));
    if (state.role === 'admin' || room.hostUserId) scheduleDbSync('room');
  }

  function loadPlayerSession(roomId) {
    return readJson(playerSessionKey(roomId), null);
  }

  function savePlayerSession(roomId, session) {
    writeJson(playerSessionKey(roomId), session);
  }

  function clearPlayerSession(roomId) {
    removeKey(playerSessionKey(roomId));
  }

  function loadDraft(roomId, playerId) {
    return readJson(draftKey(roomId, playerId), {});
  }

  function saveDraft(roomId, playerId, draft) {
    writeJson(draftKey(roomId, playerId), draft);
  }

  function clearDraft(roomId, playerId) {
    removeKey(draftKey(roomId, playerId));
  }

  function loadRoundMark(roomId, playerId) {
    return readJson(roundMarkKey(roomId, playerId), null);
  }

  function saveRoundMark(roomId, playerId, roundId) {
    writeJson(roundMarkKey(roomId, playerId), roundId);
  }

  function clearRoundMark(roomId, playerId) {
    removeKey(roundMarkKey(roomId, playerId));
  }

  function makeAppUrl(params = {}, hash = '') {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    url.hash = hash || '';
    return url.toString();
  }

  function makeJoinLink(room) {
    return makeAppUrl({
      join: room.joinToken || room.id,
      theme: room.themeMode === 'box' ? 'Boîte à thème' : room.theme
    }, '');
  }

  function normalizePseudo(room, pseudo) {
    const trimmed = pseudo.trim();
    if (!trimmed) return '';
    const existing = new Set(room.players.map((p) => p.pseudo.toLowerCase()));
    let name = trimmed;
    let i = 2;
    while (existing.has(name.toLowerCase())) {
      name = `${trimmed} (${i++})`;
    }
    return name;
  }

  function normalizeItems(items) {
    const seen = new Set();
    const clean = [];
    (items || []).forEach((item) => {
      const name = String(item || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      clean.push(name);
    });
    return clean;
  }

  function availableThemeChoices(roomOrSnapshot) {
    const used = new Set(roomOrSnapshot.usedThemeIds || []);
    return (roomOrSnapshot.themeBox || []).filter((entry) => String(entry.text || '').trim() && !used.has(entry.id));
  }

  function themeBoxCount(roomOrSnapshot) {
    return availableThemeChoices(roomOrSnapshot).length;
  }

  function currentWaitingPhrase() {
    return WAITING_PHRASES[state.ui.waitingPhraseIndex % WAITING_PHRASES.length];
  }

  function setWaitingTicker(mode) {
    if (state.ui.waitingContext === mode) return;
    if (state.ui.waitingTicker) {
      clearInterval(state.ui.waitingTicker);
      state.ui.waitingTicker = null;
    }
    state.ui.waitingContext = mode || '';
    if (!mode) return;
    state.ui.waitingTicker = setInterval(() => {
      state.ui.waitingPhraseIndex = (state.ui.waitingPhraseIndex + 1) % WAITING_PHRASES.length;
      render();
    }, 2600);
  }

  function ensureResultsReveal(room) {
    if (!room) return;
    if (state.ui.resultRevealRoomId === room.id) return;
    if (state.ui.resultTimer) clearTimeout(state.ui.resultTimer);
    state.ui.resultRevealRoomId = room.id;
    state.ui.resultRevealPhase = 'podium';
    state.ui.resultTimer = setTimeout(() => {
      state.ui.resultRevealPhase = 'full';
      render();
    }, 3600);
  }

  function skipReveal() {
    if (state.ui.resultTimer) clearTimeout(state.ui.resultTimer);
    state.ui.resultTimer = null;
    state.ui.resultRevealPhase = 'full';
    render();
  }

  function networkLabel(status) {
    if (status === 'online') return { cls: 'ok', text: 'Connexion en ligne' };
    if (status === 'connecting') return { cls: '', text: 'Connexion en cours…' };
    if (status === 'reconnecting') return { cls: '', text: 'Reconnexion…' };
    return { cls: 'bad', text: 'Hors ligne' };
  }

  function peerErrorMessage(error, isAdmin) {
    const type = error?.type || '';
    if (type === 'peer-unavailable') return 'Partie introuvable ou admin hors ligne.';
    if (type === 'network') return 'Erreur réseau. Vérifie la connexion.';
    if (type === 'browser-incompatible') return 'Navigateur incompatible avec la connexion en temps réel.';
    if (type === 'webrtc') return 'Le navigateur bloque WebRTC. Essaie Chrome ou Edge.';
    if (type === 'socket-error' || type === 'socket-closed') return 'Connexion au serveur temps réel perdue.';
    if (type === 'unavailable-id') return isAdmin ? 'Réouverture de la salle en cours…' : 'Identifiant de salle indisponible.';
    return isAdmin ? 'Impossible d’ouvrir la salle.' : 'Connexion impossible à la partie.';
  }

  function publicSnapshot(room) {
    return {
      id: room.id,
      theme: room.theme,
      themeMode: room.themeMode,
      historyTitle: room.historyTitle,
      hostUserId: room.hostUserId || null,
      hostDisplayName: room.hostDisplayName || null,
      status: room.status,
      roundId: room.roundId,
      roundNumber: room.roundNumber,
      currentHistoryId: room.currentHistoryId || null,
      usedThemeIds: [...(room.usedThemeIds || [])],
      items: [...room.items],
      themeBox: (room.themeBox || []).map((entry) => ({
        id: entry.id,
        playerId: entry.playerId,
        author: entry.author,
        text: entry.text
      })),
      chosenThemeMeta: room.chosenThemeMeta || null,
      finalResults: room.finalResults || [],
      feedback: room.feedback || {},
      players: room.players.map((player) => ({
        id: player.id,
        pseudo: player.pseudo,
        color: player.color,
        submittedAt: player.submittedAt || null,
        connected: !!player.connected,
        userId: player.userId || null,
        accountDisplayName: player.accountDisplayName || null,
        linkedPersonaId: player.linkedPersonaId || null,
        linkedPersonaName: player.linkedPersonaName || null
      }))
    };
  }

  function computeFinalResults(room) {
    const totalPlayers = room.players.length;
    const results = (room.items || []).map((name) => {
      let sum = 0;
      room.players.forEach((player) => {
        const ranking = room.rankings[player.id] || {};
        const tier = ranking[name] || 'E';
        sum += TIER_POINTS[tier] || 0;
      });
      const averagePoints = totalPlayers ? sum / totalPlayers : 0;
      const score = totalPlayers ? ((averagePoints / 5) * 100) : 0;
      let finalTier = 'E';
      if (score >= 95) finalTier = 'S';
      else if (score >= 80) finalTier = 'A';
      else if (score >= 60) finalTier = 'B';
      else if (score >= 35) finalTier = 'C';
      else if (score >= 15) finalTier = 'D';
      return {
        name,
        sum,
        averagePoints: Number(averagePoints.toFixed(2)),
        score: Number(score.toFixed(2)),
        finalTier
      };
    });
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
    return results;
  }

  function canTransitionRoom(room, nextStatus) {
    if (!room) return false;
    const current = room.status || 'lobby';
    if (current === nextStatus) return true;
    return (ROOM_STATE_TRANSITIONS[current] || []).includes(nextStatus);
  }

  function setRoomStatus(room, nextStatus) {
    if (!canTransitionRoom(room, nextStatus)) return false;
    room.status = nextStatus;
    if (nextStatus === 'ranking') {
      room.startedAt = room.startedAt || nowIso();
      room.completedAt = null;
    }
    if (nextStatus === 'results') {
      room.completedAt = room.completedAt || nowIso();
    }
    return true;
  }

  function rankingIsComplete(ranking, items) {
    const expected = normalizeItems(items || []);
    if (!expected.length) return false;
    return expected.every((item) => TIERS.includes(ranking?.[item]));
  }

  async function dbRecoverAdminRoom(roomId, adminToken) {
    const client = dbClient();
    if (!client) return null;
    const response = await client.from('games').select('id, admin_token, live_state_json').eq('id', roomId).maybeSingle();
    if (response.error && response.error.code !== 'PGRST116') throw response.error;
    if (!response.data) return null;
    if (response.data.admin_token !== adminToken) return null;
    return hydrateRoomPayload(response.data.live_state_json, roomId);
  }

  function triggerAdminRoomRecovery(route) {
    if (!route?.roomId || !route?.adminToken || !state.db.enabled) return false;
    const key = `${route.roomId}:${route.adminToken}`;
    if (state.ui.adminRecoveryKey === key && state.ui.adminRecoveryStatus === 'loading') return true;
    if (state.ui.adminRecoveryKey === key && state.ui.adminRecoveryStatus === 'done') return false;
    state.ui.adminRecoveryKey = key;
    state.ui.adminRecoveryStatus = 'loading';
    state.ui.adminRecoveryError = '';
    dbRecoverAdminRoom(route.roomId, route.adminToken).then((room) => {
      const currentRoute = getRoute();
      if (currentRoute.roomId !== route.roomId || currentRoute.adminToken !== route.adminToken) return;
      if (!room) {
        state.ui.adminRecoveryStatus = 'error';
        state.ui.adminRecoveryError = 'Salle introuvable en base ou token admin invalide.';
        render();
        return;
      }
      writeJson(activeRoomKey(room.id), cloneRoomForStorage(room));
      state.room = room;
      state.ui.roomHistoryDraft = room.historyTitle || '';
      state.ui.themeMode = room.themeMode || 'direct';
      state.ui.theme = room.theme || '';
      state.ui.adminRecoveryStatus = 'done';
      state.ui.adminRecoveryError = '';
      render();
    }).catch((error) => {
      state.ui.adminRecoveryStatus = 'error';
      state.ui.adminRecoveryError = error?.message || 'Impossible de récupérer la salle en ligne.';
      render();
    });
    return true;
  }

  function clearPlayerReconnect() {
    if (state.playerReconnectTimer) clearTimeout(state.playerReconnectTimer);
    state.playerReconnectTimer = null;
    state.playerReconnectAttempts = 0;
  }

  function schedulePlayerReconnect(roomId, session) {
    if (!roomId || !session || state.role !== 'player') return;
    if (state.playerReconnectTimer) clearTimeout(state.playerReconnectTimer);
    state.peerStatus = 'reconnecting';
    state.peerError = 'Tentative de reconnexion à la partie…';
    state.playerReconnectAttempts += 1;
    const delay = Math.min(800 * state.playerReconnectAttempts, 4000);
    state.playerReconnectTimer = setTimeout(() => {
      state.playerReconnectTimer = null;
      if (state.role !== 'player') return;
      const currentRoute = getRoute();
      if (currentRoute.roomId !== roomId || currentRoute.playerId !== session.playerId) return;
      if (!state.peer || state.peer.destroyed) {
        ensurePlayerConnection({ roomId, playerId: session.playerId });
        return;
      }
      connectPlayerToAdmin(roomId, session);
    }, delay);
    render();
  }

  function saveHistoryEntry(room) {
    const history = historyStore();
    const historyId = room.currentHistoryId || uid('history');
    const payload = {
      id: historyId,
      roomId: room.id,
      roundId: room.roundId,
      roundNumber: room.roundNumber,
      title: room.historyTitle || `Résultat — ${room.theme}`,
      theme: room.theme,
      playersCount: room.players.length,
      completedAt: room.completedAt || nowIso(),
      results: room.finalResults,
      hostUserId: room.hostUserId || null,
      hostDisplayName: room.hostDisplayName || null,
      participants: room.players.map((player) => ({
        playerId: player.id,
        pseudo: player.pseudo,
        userId: player.userId || null,
        accountDisplayName: player.accountDisplayName || null,
        linkedPersonaId: player.linkedPersonaId || null,
        linkedPersonaName: player.linkedPersonaName || null
      }))
    };
    room.currentHistoryId = historyId;
    const existingIndex = history.findIndex((entry) => entry.id === historyId || (entry.roomId === room.id && entry.roundId === room.roundId));
    if (existingIndex >= 0) history[existingIndex] = payload;
    else history.unshift(payload);
    writeJson(HISTORY_KEY, history);
    scheduleDbSync('history');
  }

  function saveHistoryEntryFromSnapshot(snapshot) {
    if (!snapshot || snapshot.status !== 'results' || !(snapshot.finalResults || []).length) return;
    const history = historyStore();
    const historyId = snapshot.currentHistoryId || `history_${snapshot.id}_${snapshot.roundId || 'single'}`;
    const payload = {
      id: historyId,
      roomId: snapshot.id,
      roundId: snapshot.roundId || null,
      roundNumber: snapshot.roundNumber || 1,
      title: snapshot.historyTitle || `Résultat — ${snapshot.theme}`,
      theme: snapshot.theme,
      playersCount: (snapshot.players || []).length,
      completedAt: nowIso(),
      results: snapshot.finalResults || [],
      hostUserId: snapshot.hostUserId || null,
      hostDisplayName: snapshot.hostDisplayName || null,
      participants: (snapshot.players || []).map((player) => ({
        playerId: player.id,
        pseudo: player.pseudo,
        userId: player.userId || null,
        accountDisplayName: player.accountDisplayName || null,
        linkedPersonaId: player.linkedPersonaId || null,
        linkedPersonaName: player.linkedPersonaName || null
      }))
    };
    const existingIndex = history.findIndex((entry) => entry.id === historyId || (entry.roomId === payload.roomId && entry.roundId === payload.roundId));
    if (existingIndex >= 0) history[existingIndex] = payload;
    else history.unshift(payload);
    writeJson(HISTORY_KEY, history);
  }

  function finishRoomIfReady() {
    if (!state.room || state.room.status !== 'ranking') return;
    const allSubmitted = state.room.players.length > 0 && state.room.players.every((player) => rankingIsComplete(state.room.rankings[player.id], state.room.items));
    if (!allSubmitted) return;
    if (!setRoomStatus(state.room, 'results')) return;
    state.room.finalResults = computeFinalResults(state.room);
    saveHistoryEntry(state.room);
  }

  function resetRoomForNextRound(room, options = {}) {
    room.rankings = {};
    room.feedback = {};
    room.finalResults = [];
    room.startedAt = null;
    room.completedAt = null;
    room.currentHistoryId = null;
    room.roundNumber = Number(room.roundNumber || 1) + 1;
    room.roundId = uid('round');
    room.players.forEach((player) => {
      player.submittedAt = null;
    });
    room.chosenThemeMeta = null;
    if (options.resetThemeBox) {
      room.theme = '';
      room.themeBox = [];
      room.usedThemeIds = [];
    }
  }

  function relaunchSamePlayers() {
    if (!state.room || !state.room.players.length) return;
    const hadBoxMode = state.room.themeMode === 'box';
    const available = hadBoxMode ? availableThemeChoices(state.room) : [];
    resetRoomForNextRound(state.room, { resetThemeBox: hadBoxMode && !available.length });
    state.room.status = 'lobby';
    state.room.themeMode = 'direct';
    state.room.theme = '';
    state.room.chosenThemeMeta = null;
    state.ui.themeMode = 'direct';
    state.ui.theme = '';
    saveActiveRoom(state.room);
    broadcastSnapshot();
    state.ui.resultRevealRoomId = null;
    state.ui.resultRevealPhase = 'full';
    if (hadBoxMode && !available.length) {
      setNotice('La boîte à thème est vide. Choisis un thème ou remplis la boîte à thème de nouveau.', 'warn', 4600);
    } else {
      setNotice('Partie relancée. Choisis un nouveau thème ou utilise la boîte à thème.', 'ok');
    }
    render();
  }

  function upsertPlayer(room, data) {
    const found = room.players.find((player) => player.id === data.playerId);
    if (found) {
      found.pseudo = data.pseudo;
      found.color = data.color;
      found.userId = data.userId || null;
      found.accountDisplayName = data.accountDisplayName || null;
      found.linkedPersonaId = data.linkedPersonaId || null;
      found.linkedPersonaName = data.linkedPersonaName || null;
      found.connected = true;
      return found;
    }
    const created = {
      id: data.playerId,
      pseudo: data.pseudo,
      color: data.color,
      userId: data.userId || null,
      accountDisplayName: data.accountDisplayName || null,
      linkedPersonaId: data.linkedPersonaId || null,
      linkedPersonaName: data.linkedPersonaName || null,
      joinedAt: nowIso(),
      submittedAt: null,
      connected: true
    };
    room.players.push(created);
    return created;
  }

  function removePlayer(room, playerId) {
    room.players = room.players.filter((player) => player.id !== playerId);
    delete room.rankings[playerId];
    try { clearDraft(room.id, playerId); } catch {}
    try { clearRoundMark(room.id, playerId); } catch {}
    room.themeBox = (room.themeBox || []).filter((entry) => entry.playerId !== playerId);
  }

  function upsertThemeSuggestion(room, payload) {
    const clean = String(payload.text || '').trim();
    room.themeBox = room.themeBox || [];
    room.usedThemeIds = Array.isArray(room.usedThemeIds) ? room.usedThemeIds : [];
    const existing = room.themeBox.find((entry) => entry.playerId === payload.playerId);
    if (!clean) {
      if (existing) room.themeBox = room.themeBox.filter((entry) => entry.playerId !== payload.playerId);
      return;
    }
    if (existing) {
      existing.text = clean;
      existing.author = payload.author;
      if (room.usedThemeIds.includes(existing.id)) {
        const previousId = existing.id;
        existing.id = uid('theme');
        room.usedThemeIds = room.usedThemeIds.filter((id) => id !== previousId);
      }
    } else {
      room.themeBox.push({
        id: uid('theme'),
        playerId: payload.playerId,
        author: payload.author,
        text: clean
      });
    }
  }

  function resetNetwork() {
    clearPlayerReconnect();
    if (state.hostConn) {
      try { state.hostConn.close(); } catch {}
    }
    Object.values(state.connections).forEach((conn) => {
      try { conn.close(); } catch {}
    });
    state.connections = {};
    if (state.peer) {
      try { state.peer.destroy(); } catch {}
    }
    state.peer = null;
    state.hostConn = null;
    cleanupJoinPreview();
    state.peerStatus = 'offline';
    state.peerError = '';
    state.role = null;
    state.snapshot = null;
    state.playerSession = null;
  }

  function broadcastSnapshot() {
    if (!state.room) return;
    const payload = { type: 'snapshot', room: publicSnapshot(state.room) };
    Object.values(state.connections).forEach((conn) => {
      if (conn && conn.open) conn.send(payload);
    });
  }

  function attemptAdminHost(room, attempt) {
    if (state.role !== 'admin' || !state.room || state.room.id !== room.id) return;
    const peer = new Peer(room.id);
    state.peer = peer;

    peer.on('open', () => {
      state.peerStatus = 'online';
      state.peerError = '';
      saveActiveRoom(state.room);
      render();
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conn.on('data', (message) => handleAdminMessage(conn, message));
        conn.on('close', () => handleAdminDisconnect(conn));
        conn.on('error', () => handleAdminDisconnect(conn));
      });
    });

    peer.on('disconnected', () => {
      state.peerStatus = 'reconnecting';
      render();
      try { peer.reconnect(); } catch {}
    });

    peer.on('close', () => {
      if (state.role === 'admin') {
        state.peerStatus = 'offline';
        render();
      }
    });

    peer.on('error', (error) => {
      if (state.role !== 'admin') return;
      if (error?.type === 'unavailable-id' && attempt < 10) {
        state.peerStatus = 'reconnecting';
        state.peerError = 'Réouverture de la salle…';
        render();
        try { peer.destroy(); } catch {}
        setTimeout(() => attemptAdminHost(room, attempt + 1), 1200);
        return;
      }
      state.peerStatus = 'error';
      state.peerError = peerErrorMessage(error, true);
      render();
    });
  }

  function ensureAdminHosting(room) {
    state.room = room;
    if (state.role === 'admin' && state.peer && state.room?.id === room.id) return;
    resetNetwork();
    state.role = 'admin';
    state.room = room;
    state.connections = {};
    state.peerStatus = 'connecting';
    state.peerError = '';
    attemptAdminHost(room, 0);
  }

  function handleAdminDisconnect(conn) {
    if (!state.room) return;
    const playerId = conn._playerId;
    if (!playerId) return;
    delete state.connections[playerId];
    const player = state.room.players.find((entry) => entry.id === playerId);
    if (player) player.connected = false;
    saveActiveRoom(state.room);
    broadcastSnapshot();
    if (player) setNotice(`${player.pseudo} s’est déconnecté.`, 'warn');
    render();
  }


  function handleAdminMessage(conn, message) {
    if (!state.room || !message || typeof message !== 'object') return;

    if (message.type === 'peek') {
      if (conn.open) conn.send({ type: 'snapshot', room: publicSnapshot(state.room) });
      return;
    }

    if (message.type === 'join') {
      const colorTaken = state.room.players.some((player) => player.color === message.color && player.id !== message.playerId);
      if (colorTaken) {
        if (conn.open) conn.send({ type: 'join-rejected', reason: 'Cette couleur est déjà prise.' });
        try { conn.close(); } catch {}
        return;
      }
      const player = upsertPlayer(state.room, message);
      conn._playerId = player.id;
      state.connections[player.id] = conn;
      player.connected = true;
      saveActiveRoom(state.room);
      broadcastSnapshot();
      if (conn.open) conn.send({ type: 'snapshot', room: publicSnapshot(state.room) });
      render();
      return;
    }

    if (message.type === 'submit') {
      if (state.room.status !== 'ranking') return;
      if (!rankingIsComplete(message.ranking || {}, state.room.items)) return;
      state.room.rankings[message.playerId] = message.ranking || {};
      const player = state.room.players.find((entry) => entry.id === message.playerId);
      if (player) {
        player.submittedAt = nowIso();
        player.connected = true;
      }
      finishRoomIfReady();
      saveActiveRoom(state.room);
      broadcastSnapshot();
      render();
      return;
    }

    if (message.type === 'theme-suggestion') {
      if (state.room.status !== 'lobby' || state.room.themeMode !== 'box') return;
      const player = state.room.players.find((entry) => entry.id === message.playerId);
      upsertThemeSuggestion(state.room, {
        playerId: message.playerId,
        author: player?.pseudo || 'Joueur',
        text: message.text
      });
      saveActiveRoom(state.room);
      broadcastSnapshot();
      render();
      return;
    }

    if (message.type === 'feedback') {
      if (state.room.status !== 'results') return;
      state.room.feedback = state.room.feedback || {};
      if (message.value === 'none') delete state.room.feedback[message.playerId];
      else if (message.value === 'like' || message.value === 'dislike') state.room.feedback[message.playerId] = message.value;
      saveActiveRoom(state.room);
      broadcastSnapshot();
      render();
      return;
    }

    if (message.type === 'leave') {
      removePlayer(state.room, message.playerId);
      delete state.connections[message.playerId];
      finishRoomIfReady();
      saveActiveRoom(state.room);
      broadcastSnapshot();
      render();
    }
  }

  function ensurePlayerConnection(route) {
    const session = loadPlayerSession(route.roomId);
    if (!session || session.playerId !== route.playerId) return;
    state.playerSession = session;
    if (state.role === 'player' && state.peer && state.playerSession?.playerId === session.playerId && state.hostConn) return;

    resetNetwork();
    state.role = 'player';
    state.playerSession = session;
    state.peerStatus = 'connecting';
    state.peerError = '';
    state.snapshot = null;

    const peer = new Peer(uid('hallila_player'));
    state.peer = peer;

    peer.on('open', () => connectPlayerToAdmin(route.roomId, session));
    peer.on('disconnected', () => {
      state.peerStatus = 'reconnecting';
      render();
      try { peer.reconnect(); } catch {}
    });
    peer.on('close', () => {
      if (state.role === 'player') {
        state.peerStatus = 'offline';
        render();
      }
    });
    peer.on('error', (error) => {
      state.peerStatus = 'error';
      state.peerError = peerErrorMessage(error, false);
      render();
    });
  }

  function connectPlayerToAdmin(roomId, session) {
    if (!state.peer) return;
    if (state.hostConn) {
      try { state.hostConn.close(); } catch {}
    }
    const conn = state.peer.connect(roomId, { reliable: true });
    state.hostConn = conn;
    let opened = false;
    let kicked = false;

    conn.on('open', () => {
      opened = true;
      clearPlayerReconnect();
      state.peerStatus = 'online';
      state.peerError = '';
      conn.send({ type: 'join', playerId: session.playerId, pseudo: session.pseudo, color: session.color, userId: session.userId || null, accountDisplayName: session.accountDisplayName || null, linkedPersonaId: session.linkedPersonaId || null, linkedPersonaName: session.linkedPersonaName || null });
      render();
    });

    conn.on('data', (message) => {
      if (message?.type === 'snapshot') {
        state.snapshot = message.room;
        clearPlayerReconnect();
        state.peerStatus = 'online';
        state.peerError = '';
        if (session) {
          const lastRoundId = loadRoundMark(roomId, session.playerId);
          if (message.room?.roundId && lastRoundId !== message.room.roundId) {
            clearDraft(roomId, session.playerId);
            saveRoundMark(roomId, session.playerId, message.room.roundId);
            session.roundId = message.room.roundId;
            savePlayerSession(roomId, session);
            state.playerSession = session;
          }
        }
        if (message.room?.status === 'results') {
          saveHistoryEntryFromSnapshot(message.room);
        }
        render();
        return;
      }
      if (message?.type === 'join-rejected') {
        kicked = true;
        clearPlayerSession(roomId);
        clearDraft(roomId, session.playerId);
        clearRoundMark(roomId, session.playerId);
        resetNetwork();
        state.ui.joinColor = session.color || state.ui.joinColor;
        state.ui.joinPseudo = session.pseudo || state.ui.joinPseudo;
        const currentRoute = getRoute();
        setRoute({ join: session.joinId || roomId, theme: currentRoute.themeHint || '' }, '');
        setNotice(message.reason || 'Impossible de rejoindre la partie.', 'bad', 4200);
        render();
        return;
      }
      if (message?.type === 'kicked') {
        kicked = true;
        clearPlayerSession(roomId);
        clearDraft(roomId, session.playerId);
        clearRoundMark(roomId, session.playerId);
        resetNetwork();
        setRoute({}, '');
        setNotice(message.reason || 'Tu as été retiré de la partie.', 'bad', 4200);
        render();
      }
    });

    conn.on('close', () => {
      if (kicked) return;
      state.hostConn = null;
      state.peerStatus = 'reconnecting';
      state.peerError = opened || state.snapshot ? 'Connexion à l’admin perdue. Reconnexion…' : 'Partie introuvable ou admin hors ligne.';
      schedulePlayerReconnect(roomId, session);
    });

    conn.on('error', () => {
      if (kicked) return;
      state.hostConn = null;
      state.peerStatus = 'reconnecting';
      state.peerError = 'Connexion temps réel instable. Reconnexion…';
      schedulePlayerReconnect(roomId, session);
    });
  }

  function createRoom(theme, historyTitle, themeMode) {
    const cleanTheme = String(theme || '').trim();
    const account = getCurrentUser();
    const room = {
      id: uid('room'),
      adminToken: uid('admin'),
      joinToken: uid('join'),
      themeMode: themeMode || 'direct',
      theme: themeMode === 'direct' ? cleanTheme : '',
      historyTitle: String(historyTitle || '').trim() || (themeMode === 'direct' && cleanTheme ? `Résultat — ${cleanTheme}` : 'Résultat — Boîte à thème'),
      status: 'lobby',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      startedAt: null,
      completedAt: null,
      chosenThemeMeta: null,
      roundId: uid('round'),
      roundNumber: 1,
      currentHistoryId: null,
      usedThemeIds: [],
      hostUserId: account?.id || null,
      hostDisplayName: account?.displayName || 'Admin',
      hostProfileColor: account?.profileColor || null,
      hostLinkedPersonaId: account?.linkedPersonaId || null,
      hostPlayerId: uid('host_player'),
      setId: state.ui.selectedSetId || null,
      players: [],
      items: normalizeItems(state.ui.itemEditor),
      rankings: {},
      feedback: {},
      finalResults: [],
      themeBox: []
    };
    saveActiveRoom(room);
    state.ui.roomHistoryDraft = room.historyTitle;
    setRoute({ room: room.id, admin: room.adminToken }, '');
    render();
  }

  function startRoom() {
    if (!state.room) return;
    if (state.room.status !== 'lobby') {
      setNotice('La manche est déjà en cours ou terminée.', 'warn');
      return;
    }
    if (!state.room.players.length) {
      setNotice('Attends au moins un joueur avant de lancer.', 'warn');
      return;
    }
    if (state.room.themeMode === 'box') {
      const choices = availableThemeChoices(state.room);
      if (!choices.length) {
        setNotice('La boîte à thème est vide. Ajoute au moins un thème non utilisé avant de lancer.', 'warn');
        return;
      }
      const pick = choices[Math.floor(Math.random() * choices.length)];
      state.room.theme = pick.text;
      state.room.chosenThemeMeta = { author: pick.author, playerId: pick.playerId };
      state.room.usedThemeIds = [...(state.room.usedThemeIds || []), pick.id];
    }
    if (!String(state.room.theme || '').trim()) {
      setNotice('Entre un thème valide avant de lancer.', 'warn');
      return;
    }
    if (!setRoomStatus(state.room, 'ranking')) {
      setNotice('Transition de manche invalide.', 'bad');
      return;
    }
    saveActiveRoom(state.room);
    broadcastSnapshot();
    render();
  }

  async function joinRoom(route, options = {}) {
    const pseudo = (state.ui.joinPseudo || '').trim();
    if (!pseudo) {
      setNotice('Entre un pseudo valide.', 'warn');
      return false;
    }
    if (!window.Peer) {
      setNotice('PeerJS n’a pas chargé. Vérifie la connexion internet.', 'bad');
      return false;
    }

    const resolvedRoom = await resolveJoinRoom(route.joinId);
    if (!resolvedRoom) {
      setNotice('Salle introuvable via ce lien.', 'bad');
      return false;
    }

    const taken = usedColors(publicSnapshot(resolvedRoom));
    if (taken.has(state.ui.joinColor)) {
      setNotice('Cette couleur est déjà prise.', 'warn');
      return false;
    }

    const account = getCurrentUser();
    const linkedPersona = personaById(account?.linkedPersonaId);
    const normalizedPseudo = normalizePseudo(resolvedRoom, pseudo);
    const session = {
      playerId: uid('player'),
      pseudo: normalizedPseudo,
      color: state.ui.joinColor,
      joinId: route.joinId,
      userId: account?.id || null,
      accountDisplayName: account?.displayName || null,
      linkedPersonaId: linkedPersona?.id || null,
      linkedPersonaName: linkedPersona?.name || null
    };
    savePlayerSession(resolvedRoom.id, session);

    if (options.openInNewTab) {
      const url = makeAppUrl({ room: resolvedRoom.id, player: session.playerId }, '');
      window.open(url, '_blank', 'noopener');
      setNotice('Onglet joueur ouvert. Garde l’onglet admin ouvert en parallèle.', 'ok');
      return true;
    }

    setRoute({ room: resolvedRoom.id, player: session.playerId }, '');
    render();
    return true;
  }

  function leavePlayerRoom() {
    const route = getRoute();
    const playerId = state.playerSession?.playerId || route.playerId;
    if (state.hostConn && state.hostConn.open && playerId) {
      try {
        state.hostConn.send({ type: 'leave', playerId });
      } catch {}
    }
    if (route.roomId && playerId) {
      clearDraft(route.roomId, playerId);
      clearRoundMark(route.roomId, playerId);
    }
    if (route.roomId) clearPlayerSession(route.roomId);
    resetNetwork();
    setRoute({}, '');
    render();
  }

  function adminRemovePlayer(playerId) {
    if (!state.room) return;
    const player = state.room.players.find((entry) => entry.id === playerId);
    if (!player) return;
    const conn = state.connections[playerId];
    if (conn && conn.open) {
      try { conn.send({ type: 'kicked', reason: 'L’admin t’a retiré de la partie.' }); } catch {}
      try { conn.close(); } catch {}
    }
    delete state.connections[playerId];
    removePlayer(state.room, playerId);
    finishRoomIfReady();
    saveActiveRoom(state.room);
    broadcastSnapshot();
    render();
  }

  function moveDraftItem(roomId, playerId, item, tier) {
    const draft = loadDraft(roomId, playerId);
    if (tier === 'UNASSIGNED' || !tier) delete draft[item];
    else draft[item] = tier;
    saveDraft(roomId, playerId, draft);
    render();
  }

  function submitRanking(roomId, playerId, items) {
    const draft = loadDraft(roomId, playerId);
    const targetItems = items || DEFAULT_ITEMS;
    const missing = targetItems.filter((item) => !draft[item]);
    if (missing.length) {
      setNotice('Classe tous les noms avant d’envoyer la tier list.', 'warn');
      return;
    }
    if (!state.hostConn || !state.hostConn.open) {
      setNotice('Connexion avec l’admin perdue.', 'bad');
      return;
    }
    state.hostConn.send({ type: 'submit', playerId, ranking: draft });
  }

  function updateRoomHistoryTitle(newTitle) {
    if (!state.room || !newTitle.trim()) {
      setNotice('Entre un titre valide.', 'warn');
      return;
    }
    state.room.historyTitle = newTitle.trim();
    state.ui.roomHistoryDraft = state.room.historyTitle;
    saveActiveRoom(state.room);
    const history = historyStore();
    const entry = history.find((item) => item.id === state.room.currentHistoryId || (item.roomId === state.room.id && item.roundId === state.room.roundId));
    if (entry) {
      entry.title = state.room.historyTitle;
      writeJson(HISTORY_KEY, history);
    }
    setNotice('Titre historique enregistré.', 'ok');
    render();
  }

  function updateHistoryTitle(entryId, newTitle) {
    if (!newTitle.trim()) {
      setNotice('Entre un titre valide.', 'warn');
      return;
    }
    const history = historyStore();
    const entry = history.find((item) => item.id === entryId);
    if (!entry) return;
    entry.title = newTitle.trim();
    writeJson(HISTORY_KEY, history);
    const room = loadActiveRoom(entry.roomId);
    if (room && ((!entry.roundId) || room.roundId === entry.roundId || room.currentHistoryId === entry.id)) {
      room.historyTitle = newTitle.trim();
      saveActiveRoom(room);
      if (state.room?.id === room.id) state.room.historyTitle = newTitle.trim();
    }
    setNotice('Titre historique enregistré.', 'ok');
    render();
  }

  function saveItemEditorToRoom() {
    if (!state.room || state.room.status !== 'lobby') return;
    const items = normalizeItems(state.ui.itemEditor);
    if (items.length < 2) {
      setNotice('Il faut au moins 2 noms à classer.', 'warn');
      return;
    }
    state.room.items = items;
    saveActiveRoom(state.room);
    broadcastSnapshot();
    setNotice('Liste des noms sauvegardée.', 'ok');
    render();
  }

  function syncItemEditor(room) {
    if (state.ui.itemEditorRoomId !== room.id) {
      state.ui.itemEditorRoomId = room.id;
      state.ui.itemEditor = [...(room.items || DEFAULT_ITEMS)];
      state.ui.newItemName = '';
    }
  }

  function submitThemeSuggestionFromPlayer(route, text) {
    if (!state.hostConn || !state.hostConn.open) {
      setNotice('Connexion avec l’admin perdue.', 'bad');
      return;
    }
    state.hostConn.send({ type: 'theme-suggestion', playerId: route.playerId, text });
  }

  function submitThemeSuggestionFromAdmin(text) {
    if (!state.room) return;
    upsertThemeSuggestion(state.room, {
      playerId: `admin_${state.room.id}`,
      author: 'Admin',
      text
    });
    saveActiveRoom(state.room);
    broadcastSnapshot();
    render();
  }

  function brand(options = {}) {
    const compact = options.compact || false;
    const home = options.home || false;
    const classes = ['brand-wrap'];
    if (home) classes.push('home-brand');
    return `
      <div class="${classes.join(' ')}">
        <h1 class="brand"${compact ? ' style="font-size:clamp(48px,5.5vw,76px)"' : ''}>${APP_TITLE}</h1>
        <p class="brand-sub"${compact ? ' style="font-size:clamp(16px,1.8vw,26px)"' : ''}>${APP_SUBTITLE}</p>
      </div>
    `;
  }

  function networkBadge() {
    const label = networkLabel(state.peerStatus);
    return `
      <div class="network-status">
        <span class="network-dot ${label.cls}"></span>
        <span>${label.text}</span>
      </div>
    `;
  }

  function playerPills(players, showSubmitted = false) {
    return `
      <div class="players-grid">
        ${players.map((player) => `
          <div class="player-pill">
            <div class="player-label" style="background:${player.color};">
              <span class="player-chip-dot"></span>
              ${escapeHtml(player.pseudo)}
              <span class="connected-dot ${player.connected ? 'on' : 'off'}"></span>
              ${showSubmitted && player.submittedAt ? '<span>✓</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function personCard(name, currentTier) {
    const color = currentTier ? TIER_COLORS[currentTier] : 'rgba(255,255,255,.12)';
    return `
      <div class="person-card" draggable="true" data-item="${escapeHtml(name)}" style="border-color:${color};box-shadow:0 0 0 2px ${currentTier ? `${color}33` : 'transparent'};">
        <div class="person-name">${escapeHtml(name)}</div>
        <div class="quick-actions">
          ${TIERS.map((tier) => `
            <button class="quick-btn" data-move-item="${escapeHtml(name)}" data-target-tier="${tier}" style="border-color:${currentTier === tier ? TIER_COLORS[tier] : 'rgba(255,255,255,.35)'};background:${currentTier === tier ? `${TIER_COLORS[tier]}22` : 'transparent'}">${tier}</button>
          `).join('')}
          <button class="quick-btn clear" data-move-item="${escapeHtml(name)}" data-target-tier="UNASSIGNED">↺</button>
        </div>
      </div>
    `;
  }

  function miniRows(results) {
    const counts = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    (results || []).forEach((item) => { counts[item.finalTier] += 1; });
    return TIERS.map((tier) => `
      <div class="mini-row">
        <div class="mini-badge" style="background:${TIER_COLORS[tier]}">${tier}</div>
        <div class="mini-track">
          ${Array.from({ length: Math.max(counts[tier], 1) }).map(() => '<div class="mini-block"></div>').join('')}
        </div>
      </div>
    `).join('');
  }

  function spinnerBlock(extra = '') {
    return `
      <div class="waiting-cluster">
        <div class="spinner"></div>
        <div class="title-big" style="font-size:clamp(22px,2.6vw,34px);">${escapeHtml(extra || 'Waiting screen')} <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>
        <div class="waiting-phrase">${escapeHtml(currentWaitingPhrase())}</div>
      </div>
    `;
  }

  function themeModeBadge(roomOrSnapshot) {
    return roomOrSnapshot.themeMode === 'box'
      ? `<span class="theme-badge"><span class="dot"></span>Boîte à thème · ${themeBoxCount(roomOrSnapshot)} proposition${themeBoxCount(roomOrSnapshot) > 1 ? 's' : ''}</span>`
      : `<span class="theme-badge"><span class="dot" style="background:var(--ok)"></span>Thème direct</span>`;
  }

  function themeBoxList(entries, usedIds = []) {
    const used = new Set(usedIds || []);
    const list = (entries || []).filter((entry) => String(entry.text || '').trim());
    if (!list.length) return '<div class="empty-small">La boîte à thème est vide pour le moment.</div>';
    return `<div class="theme-box-list">${list.map((entry) => `<div class="theme-chip"><strong>${escapeHtml(entry.author)}</strong>${escapeHtml(entry.text)}${used.has(entry.id) ? '<span class="subtle"> · déjà joué</span>' : ''}</div>`).join('')}</div>`;
  }

  function roundRestartBanner(roundNumber) {
    const round = Number(roundNumber || 1);
    if (round <= 1) return '';
    return `
      <div class="round-banner">
        <div class="round-banner-kicker">Nouvelle manche</div>
        <div class="round-banner-title">Manche ${round}</div>
        <div class="round-banner-sub">Même groupe, nouveau classement. Préparez-vous à relancer le débat.</div>
      </div>
    `;
  }

  function podiumMarkup(results) {
    const top = (results || []).slice(0, 3);
    const medals = ['second', 'first', 'third'];
    const order = [1, 0, 2].filter((index) => top[index]);
    return `
      <div class="podium-card">
        <div class="label-top">Révélation</div>
        <h2 class="title-big">Le podium se dévoile…</h2>
        <div class="podium-grid">
          ${order.map((index) => {
            const item = top[index];
            const rank = index === 0 ? 1 : index === 1 ? 2 : 3;
            const medalClass = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
            return `
              <div class="podium-slot ${rank === 1 ? 'first' : ''}">
                <div class="medal ${medalClass}">${rank}</div>
                <div class="podium-name">${escapeHtml(item.name)}</div>
                <div class="podium-score">${item.score}% · Tier ${item.finalTier}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="reveal-hint">La tier list complète s’affiche automatiquement juste après.</div>
        <div class="row" style="justify-content:center;"><button class="btn" data-action="skip-reveal">Voir la tier list complète</button></div>
      </div>
    `;
  }

  function layout(label, inner) {
    app.innerHTML = `
      <div class="page">
        <div class="page-label">${escapeHtml(label)}</div>
        <div class="surface">
          <div class="screen">
            ${state.ui.notice ? `<div class="notice ${state.ui.notice.tone || 'warn'}">${escapeHtml(state.ui.notice.text)}</div>` : ''}
            ${inner}
          </div>
        </div>
        <button class="music-fab ${state.ui.musicEnabled ? 'active' : ''}" data-action="music-toggle" title="${state.ui.musicEnabled ? 'Couper la musique' : 'Relancer la musique'}">${state.ui.musicEnabled ? '♫ Musique on' : '♫ Musique off'}</button>
      </div>
    `;
    setupDnD();
    setupMusicUnlock();
    if (state.ui.musicEnabled) setTimeout(() => tryStartMusic(), 0);
  }

  function renderHome() {
    setWaitingTicker(null);
    syncJoinDefaultsFromAccount();
    const user = getCurrentUser();
    layout('', `
      <div class="center-stack home-hero">
        ${brand({ home: true })}
        <div class="home-actions">
          <button class="big-btn" data-action="go-create">Lancer une partie</button>
          <button class="ghost-btn" data-action="go-history">Historique</button>
          ${user ? '<button class="ghost-btn" data-action="go-profile">Mon compte</button>' : '<button class="ghost-btn" data-action="go-account">Créer un compte / Connexion</button>'}
        </div>
        <div class="home-splash">
          ${accountBadge()}
          <div class="footer-note">Mode multijoueur temps réel : les joueurs peuvent rejoindre depuis un autre appareil avec le lien de partie.</div>
          <div class="footer-note">${state.db.enabled ? `BDD active · ${escapeHtml(dbStatusLabel())}${state.db.lastSyncAt ? ` · ${escapeHtml(formatDate(state.db.lastSyncAt))}` : ''}` : 'Mode local uniquement tant que Supabase n’est pas configuré.'}</div>
        </div>
      </div>
    `);
  }

  function renderCreate() {
    setWaitingTicker(null);
    const sets = itemSetsStore();
    layout('Créer une partie', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Retour</button>
        ${brand()}
        <div class="meta-side">
          <button class="btn" data-action="create-room">Créer</button>
          <div class="subtle">${state.ui.themeMode === 'box' ? 'Boîte à thème activée' : `${state.ui.itemEditor.length} personnes à classer`}</div>
        </div>
      </div>
      <div class="create-stack">
        <div class="card">
          <div class="form-grid">
            <div style="text-align:left;">
              <div class="label-top">Mode de thème</div>
              <div class="mode-row">
                <button class="mode-btn ${state.ui.themeMode === 'direct' ? 'active' : ''}" data-action="set-theme-mode-direct">Choisir le thème maintenant</button>
                <button class="mode-btn ${state.ui.themeMode === 'box' ? 'active' : ''}" data-action="set-theme-mode-box">Se fier à la boîte à thème</button>
              </div>
            </div>
            <div style="text-align:left;">
              <div class="label-top">${state.ui.themeMode === 'direct' ? 'Thème de la tier list' : 'Nom interne de la partie (optionnel)'}</div>
              <input id="theme-input" class="text-input" placeholder="${state.ui.themeMode === 'direct' ? 'Exemple : Qui a le plus de flow ?' : 'Exemple : Soirée du samedi'}" value="${escapeHtml(state.ui.theme)}">
            </div>
            <div style="text-align:left;">
              <div class="label-top">Titre dans l’historique</div>
              <input id="history-title-input" class="text-input" placeholder="Exemple : Soirée du 12 avril" value="${escapeHtml(state.ui.historyTitle)}">
            </div>
          </div>
        </div>

        <div class="items-card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="label-top">Set actuel</div>
              <div class="subtle">Prépare la liste des personnes à classer avant de créer la partie.</div>
            </div>
            <div class="row">
              <button class="btn" data-action="reset-default-items">Liste par défaut</button>
            </div>
          </div>
          <div class="items-table" style="margin-top:12px;">
            ${state.ui.itemEditor.map((item, index) => `
              <div class="item-row">
                <input class="text-input" data-item-name-index="${index}" value="${escapeHtml(item)}" placeholder="Nom à classer">
                <div class="item-controls">
                  <button class="btn" data-action="delete-item" data-delete-index="${index}">Supprimer</button>
                </div>
              </div>
            `).join('')}
            <div class="item-row">
              <input id="new-item-input" class="text-input" placeholder="Ajouter un nouveau nom" value="${escapeHtml(state.ui.newItemName)}">
              <div class="item-controls">
                <button class="btn" data-action="add-item">Ajouter</button>
              </div>
            </div>
          </div>
        </div>

        <div class="items-card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="label-top">Sets enregistrés</div>
              <div class="subtle">Crée, réutilise et modifie tes sets de joueurs.</div>
            </div>
            <div class="subtle">${sets.length} set${sets.length > 1 ? 's' : ''}</div>
          </div>
          <div class="row" style="margin-top:12px;align-items:flex-end;">
            <div style="flex:1;min-width:220px;">
              <div class="label-top">Nom du set</div>
              <input id="set-name-input" class="text-input" placeholder="Exemple : Les cousins" value="${escapeHtml(state.ui.newSetName)}">
            </div>
            <button class="btn" data-action="save-current-set">${state.ui.selectedSetId ? 'Mettre à jour le set' : 'Créer le set'}</button>
          </div>
          <div class="sets-grid" style="margin-top:14px;">
            ${sets.length ? sets.map((set) => `
              <div class="set-card ${state.ui.selectedSetId === set.id ? 'active' : ''}">
                <div class="row" style="justify-content:space-between;">
                  <strong>${escapeHtml(set.name)}</strong>
                  <span class="subtle">${set.items.length} noms</span>
                </div>
                <div class="set-preview">${set.items.slice(0, 6).map((name) => `<span>${escapeHtml(name)}</span>`).join('')}${set.items.length > 6 ? '<span>…</span>' : ''}</div>
                <div class="history-actions">
                  <button class="btn" data-action="load-set" data-set-id="${set.id}">Utiliser</button>
                  <button class="btn" data-action="delete-set" data-set-id="${set.id}">Supprimer</button>
                </div>
              </div>
            `).join('') : '<div class="empty-small">Aucun set enregistré pour le moment.</div>'}
          </div>
        </div>

        <div class="items-card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="label-top">Personas Autres</div>
              <div class="subtle">Les comptes ajoutés hors pack principal apparaissent ici. Tu peux les intégrer au set courant.</div>
            </div>
            <div class="subtle">${otherPersonas().length} profil${otherPersonas().length > 1 ? 's' : ''}</div>
          </div>
          <div class="sets-grid" style="margin-top:14px;">
            ${otherPersonas().length ? otherPersonas().map((persona) => `
              <div class="set-card">
                <div class="row" style="justify-content:space-between;">
                  <strong>${escapeHtml(persona.name)}</strong>
                  <span class="subtle">Autres</span>
                </div>
                <div class="footer-note">${persona.claimedByUserId ? 'Compte lié' : 'Persona libre'}</div>
                <div class="history-actions">
                  <button class="btn" data-action="add-other-persona" data-persona-id="${persona.id}">Ajouter au set</button>
                </div>
              </div>
            `).join('') : '<div class="empty-small">Aucun profil dans Autres pour le moment.</div>'}
          </div>
        </div>
      </div>
    `);
  }

  function joinInlineAuthMarkup() {
    if (!state.ui.joinAuthExpanded || getCurrentUser()) return '';
    return `
      <div class="card" style="display:grid;gap:16px;text-align:left;">
        <div class="mode-row">
          <button class="mode-btn ${state.ui.authTab === 'register' ? 'active' : ''}" data-action="switch-auth-register">Créer un compte</button>
          <button class="mode-btn ${state.ui.authTab === 'login' ? 'active' : ''}" data-action="switch-auth-login">Connexion</button>
          <button class="mode-btn ${state.ui.authTab === 'forgot' ? 'active' : ''}" data-action="switch-auth-forgot">Mot de passe oublié</button>
        </div>
        ${state.ui.authTab === 'register' ? `
          <div class="form-grid">
            <div><div class="label-top">Pseudo du compte</div><input id="auth-register-name" class="text-input" placeholder="Exemple : DavidB" value="${escapeHtml(state.ui.authRegisterName)}"></div>
            <div><div class="label-top">Email</div><input id="auth-register-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authRegisterEmail)}"></div>
            <div><div class="label-top">Mot de passe</div><input id="auth-register-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authRegisterPassword)}"></div>
            <div class="row">
              <button class="big-btn" style="min-width:0;width:auto;" data-action="create-account">Créer et continuer</button>
              <button class="btn" data-action="join-auth-hide">Rester en invité</button>
            </div>
          </div>
        ` : state.ui.authTab === 'login' ? `
          <div class="form-grid">
            <div><div class="label-top">Email</div><input id="auth-login-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authLoginEmail)}"></div>
            <div><div class="label-top">Mot de passe</div><input id="auth-login-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authLoginPassword)}"></div>
            <div class="row">
              <button class="big-btn" style="min-width:0;width:auto;" data-action="login-account">Se connecter</button>
              <button class="btn" data-action="join-auth-hide">Rester en invité</button>
            </div>
          </div>
        ` : `
          <div class="form-grid">
            <div><div class="label-top">Email du compte</div><input id="auth-forgot-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authForgotEmail)}"></div>
            <div><div class="label-top">Nouveau mot de passe</div><input id="auth-forgot-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authForgotPassword)}"></div>
            <div><div class="label-top">Confirmer le nouveau mot de passe</div><input id="auth-forgot-confirm" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authForgotConfirm)}"></div>
            <div class="row">
              <button class="big-btn" style="min-width:0;width:auto;" data-action="reset-password">Réinitialiser</button>
              <button class="btn" data-action="switch-auth-login">Retour connexion</button>
            </div>
          </div>
        `}
      </div>
    `;
  }

  function renderJoin(route) {
    setWaitingTicker(null);
    syncJoinDefaultsFromAccount();
    ensureJoinPreview(route.joinId);
    const preview = state.ui.joinPreview;
    const currentUser = getCurrentUser();
    const title = preview?.themeMode === 'box' ? 'Boîte à thème' : (preview?.theme || route.themeHint || 'Tier list');
    const taken = usedColors(preview);
    const isHostViewer = !!(currentUser && preview?.hostUserId && currentUser.id === preview.hostUserId);
    if (taken.has(state.ui.joinColor)) {
      const free = PLAYER_COLORS.find((color) => !taken.has(color));
      if (free) state.ui.joinColor = free;
    }
    layout('Rejoindre une partie', `
      <div class="center-stack">
        ${brand()}
        <div class="card" style="display:grid;gap:18px;text-align:left;">
          <div>
            <div class="label-top">${title === 'Boîte à thème' ? 'Mode' : 'Thème'}</div>
            <div style="font-size:clamp(28px,3.4vw,46px);font-weight:800;">${escapeHtml(title)}</div>
          </div>
          <div class="join-preview-status">${preview ? `${preview.players.length} joueur${preview.players.length > 1 ? 's' : ''} déjà connectés` : (state.ui.joinPreviewStatus === 'connecting' ? 'Vérification du lien de partie…' : 'La salle sera vérifiée à la connexion')}</div>

          ${currentUser ? `
            <div class="notice ok">
              Compte détecté : <strong>${escapeHtml(currentUser.displayName)}</strong>${personaById(currentUser.linkedPersonaId) ? ` · Persona liée : ${escapeHtml(personaById(currentUser.linkedPersonaId).name)}` : ''}
            </div>
          ` : `
            <div class="card" style="display:grid;gap:12px;text-align:left;">
              <div class="label-top">Choix d’entrée</div>
              <div class="subtle">Tu peux jouer tout de suite en invité, ou créer / connecter un compte pour garder ton profil et tes stats.</div>
              <div class="row">
                <button class="btn ${!state.ui.joinAuthExpanded ? 'active' : ''}" data-action="join-auth-hide">Continuer sans compte</button>
                <button class="btn ${state.ui.joinAuthExpanded ? 'active' : ''}" data-action="join-auth-show">Créer un compte / Connexion</button>
              </div>
            </div>
            ${joinInlineAuthMarkup()}
          `}

          ${isHostViewer ? `
            <div class="notice warn">
              Tu es aussi l’admin de cette salle. Pour jouer sans couper l’admin, ouvre ta place joueur dans un autre onglet.
              <div class="row" style="margin-top:10px;">
                <button class="btn" data-action="open-player-link">Ouvrir ma place joueur dans un autre onglet</button>
              </div>
            </div>
          ` : ''}

          <div>
            <div class="label-top">Pseudo</div>
            <input id="join-pseudo" class="text-input" placeholder="Entre ton pseudo" value="${escapeHtml(state.ui.joinPseudo)}">
          </div>
          <div>
            <div class="label-top">Couleur du joueur</div>
            <div class="color-grid">
              ${PLAYER_COLORS.map((color) => {
                const disabled = taken.has(color) && state.ui.joinColor !== color;
                return `<button class="swatch ${state.ui.joinColor === color ? 'active' : ''} ${disabled ? 'disabled' : ''}" ${disabled ? 'disabled' : ''} data-color="${color}" style="background:${color};border-color:${state.ui.joinColor === color ? '#fff' : 'rgba(255,255,255,.32)'}"></button>`;
              }).join('')}
            </div>
            <div class="footer-note" style="margin-top:8px;">Une couleur déjà choisie devient indisponible pour les autres joueurs.</div>
          </div>
          <div class="row">
            <button class="big-btn" style="min-width:0;width:auto;" data-action="join-room">Rejoindre la partie</button>
            <button class="btn" data-action="go-home">Annuler</button>
          </div>
          ${state.ui.joinPreviewError ? `<div style="color:var(--bad);">${escapeHtml(state.ui.joinPreviewError)}</div>` : ''}
          <div class="footer-note">Une fois la partie créée, les joueurs rejoignent la salle grâce au lien partagé. L’admin peut aussi rejoindre via ce lien en ouvrant une place joueur séparée.</div>
        </div>
      </div>
    `);
  }


  function renderAccount() {
    setWaitingTicker(null);
    ensureAccountSeedData();
    const user = getCurrentUser();
    if (user) {
      bindAuthUiFromUser(user);
      renderProfile();
      return;
    }
    const availableCore = availableCorePersonas();
    layout('Compte', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Retour</button>
        ${brand()}
        <div class="meta-side"><div class="subtle">Compte local de démonstration</div></div>
      </div>
      <div class="create-stack">
        <div class="card">
          <div class="mode-row">
            <button class="mode-btn ${state.ui.authTab === 'register' ? 'active' : ''}" data-action="switch-auth-register">Créer un compte</button>
            <button class="mode-btn ${state.ui.authTab === 'login' ? 'active' : ''}" data-action="switch-auth-login">Connexion</button>
            <button class="mode-btn ${state.ui.authTab === 'forgot' ? 'active' : ''}" data-action="switch-auth-forgot">Mot de passe oublié</button>
          </div>
        </div>
        ${state.ui.authTab === 'register' ? `
          <div class="card">
            <div class="form-grid">
              <div><div class="label-top">Pseudo du compte</div><input id="auth-register-name" class="text-input" placeholder="Exemple : DavidB" value="${escapeHtml(state.ui.authRegisterName)}"></div>
              <div><div class="label-top">Email</div><input id="auth-register-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authRegisterEmail)}"></div>
              <div><div class="label-top">Mot de passe</div><input id="auth-register-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authRegisterPassword)}"></div>
              <div>
                <div class="label-top">Couleur favorite</div>
                <div class="color-grid">${PLAYER_COLORS.map((color) => `<button class="swatch ${state.ui.authProfileColor === color ? 'active' : ''}" data-auth-color="${color}" style="background:${color};border-color:${state.ui.authProfileColor === color ? '#fff' : 'rgba(255,255,255,.32)'}"></button>`).join('')}</div>
              </div>
              <div>
                <div class="label-top">Lier mon compte à une persona</div>
                <div class="mode-row">
                  <button class="mode-btn ${state.ui.authLinkMode === 'none' ? 'active' : ''}" data-action="auth-link-none">Pas maintenant</button>
                  <button class="mode-btn ${state.ui.authLinkMode === 'core' ? 'active' : ''}" data-action="auth-link-core">Je suis déjà dans le pack principal</button>
                  <button class="mode-btn ${state.ui.authLinkMode === 'other' ? 'active' : ''}" data-action="auth-link-other">Me mettre dans Autres</button>
                </div>
              </div>
              ${state.ui.authLinkMode === 'core' ? `
                <div>
                  <div class="label-top">Persona du pack principal</div>
                  <select id="auth-persona-select" class="text-input auth-select">${availableCore.length ? availableCore.map((persona) => `<option value="${persona.id}" ${state.ui.authPersonaId === persona.id ? 'selected' : ''}>${escapeHtml(persona.name)}</option>`).join('') : '<option value="">Aucune persona disponible</option>'}</select>
                </div>
              ` : ''}
              ${state.ui.authLinkMode === 'other' ? `
                <div>
                  <div class="label-top">Nom dans Autres</div>
                  <input id="auth-other-name" class="text-input" placeholder="Ton nom / ton blaze" value="${escapeHtml(state.ui.authOtherName)}">
                </div>
              ` : ''}
              <div class="row"><button class="big-btn" style="min-width:0;width:auto;" data-action="create-account">Créer mon compte</button></div>
            </div>
          </div>
        ` : state.ui.authTab === 'login' ? `
          <div class="card">
            <div class="form-grid">
              <div><div class="label-top">Email</div><input id="auth-login-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authLoginEmail)}"></div>
              <div><div class="label-top">Mot de passe</div><input id="auth-login-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authLoginPassword)}"></div>
              <div class="row">
                <button class="big-btn" style="min-width:0;width:auto;" data-action="login-account">Se connecter</button>
                <button class="btn" data-action="switch-auth-forgot">Mot de passe oublié ?</button>
              </div>
            </div>
          </div>
        ` : `
          <div class="card">
            <div class="form-grid">
              <div><div class="label-top">Email du compte</div><input id="auth-forgot-email" class="text-input" placeholder="toi@mail.com" value="${escapeHtml(state.ui.authForgotEmail)}"></div>
              <div><div class="label-top">Nouveau mot de passe</div><input id="auth-forgot-password" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authForgotPassword)}"></div>
              <div><div class="label-top">Confirmer le nouveau mot de passe</div><input id="auth-forgot-confirm" type="password" class="text-input" placeholder="••••••" value="${escapeHtml(state.ui.authForgotConfirm)}"></div>
              <div class="footer-note">Réinitialisation locale de démonstration : le mot de passe du compte est mis à jour directement dans l’application.</div>
              <div class="row">
                <button class="big-btn" style="min-width:0;width:auto;" data-action="reset-password">Réinitialiser le mot de passe</button>
                <button class="btn" data-action="switch-auth-login">Retour à la connexion</button>
              </div>
            </div>
          </div>
        `}
      </div>
    `);
  }

  function renderProfile() {
    setWaitingTicker(null);
    const user = getCurrentUser();
    if (!user) {
      renderAccount();
      return;
    }
    bindAuthUiFromUser(user);
    const stats = personaStatsForUser(user);
    const entries = userHistoryEntries(user);
    const availableCore = availableCorePersonas(user.id);
    layout('Mon compte', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Retour</button>
        ${brand()}
        <div class="meta-side">
          <button class="btn" data-action="logout-account">Déconnexion</button>
          <div class="subtle">Compte local</div>
        </div>
      </div>
      <div class="create-stack">
        ${accountSummaryMarkup(user)}
        <div class="card">
          <div class="form-grid">
            <div><div class="label-top">Pseudo du compte</div><input id="auth-register-name" class="text-input" value="${escapeHtml(state.ui.authRegisterName)}"></div>
            <div><div class="label-top">Email</div><input class="text-input" value="${escapeHtml(user.email)}" disabled></div>
            <div>
              <div class="label-top">Couleur favorite</div>
              <div class="color-grid">${PLAYER_COLORS.map((color) => `<button class="swatch ${state.ui.authProfileColor === color ? 'active' : ''}" data-auth-color="${color}" style="background:${color};border-color:${state.ui.authProfileColor === color ? '#fff' : 'rgba(255,255,255,.32)'}"></button>`).join('')}</div>
            </div>
            <div>
              <div class="label-top">Lier mon compte à une persona</div>
              <div class="mode-row">
                <button class="mode-btn ${state.ui.authLinkMode === 'none' ? 'active' : ''}" data-action="auth-link-none">Aucune</button>
                <button class="mode-btn ${state.ui.authLinkMode === 'core' ? 'active' : ''}" data-action="auth-link-core">Pack principal</button>
                <button class="mode-btn ${state.ui.authLinkMode === 'other' ? 'active' : ''}" data-action="auth-link-other">Autres</button>
              </div>
            </div>
            ${state.ui.authLinkMode === 'core' ? `<div><div class="label-top">Persona du pack principal</div><select id="auth-persona-select" class="text-input auth-select">${availableCore.length ? availableCore.map((persona) => `<option value="${persona.id}" ${state.ui.authPersonaId === persona.id ? 'selected' : ''}>${escapeHtml(persona.name)}</option>`).join('') : '<option value="">Aucune persona disponible</option>'}</select></div>` : ''}
            ${state.ui.authLinkMode === 'other' ? `<div><div class="label-top">Nom dans Autres</div><input id="auth-other-name" class="text-input" value="${escapeHtml(state.ui.authOtherName)}" placeholder="Ton nom / ton blaze"></div>` : ''}
            <div class="row"><button class="big-btn" style="min-width:0;width:auto;" data-action="save-profile">Enregistrer mon profil</button></div>
          </div>
        </div>
        <div class="card">
          <div class="label-top">Stats persona</div>
          ${stats ? `
            <div class="row" style="justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:clamp(24px,2.8vw,38px);font-weight:800;">${escapeHtml(stats.persona.name)}</div>
                <div class="subtle">${stats.count} apparition${stats.count > 1 ? 's' : ''} dans l’historique</div>
              </div>
              <div class="players-count">${stats.avgScore}%</div>
            </div>
            <div class="row">${TIERS.map((tier) => `<span class="tag">${tier} : ${stats.distribution[tier]}</span>`).join('')}</div>
            <div class="footer-note">Meilleur score : ${stats.best ? `${stats.best.score}% (${stats.best.finalTier})` : '—'} · Pire score : ${stats.worst ? `${stats.worst.score}% (${stats.worst.finalTier})` : '—'}</div>
          ` : '<div class="subtle">Lie ton compte à une persona pour voir tes stats personnelles.</div>'}
        </div>
        <div class="card">
          <div class="label-top">Mon historique</div>
          <div class="history-grid" style="width:100%;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
            ${entries.length ? entries.slice(0, 6).map((entry) => `
              <div class="history-card" style="min-height:0;">
                <div class="history-mini-board">${miniRows(entry.results)}</div>
                <div class="history-card-title">${escapeHtml(entry.title)}</div>
                <div class="history-card-meta">${formatDate(entry.completedAt)}</div>
                <div class="history-actions"><button class="btn" data-history-open="${entry.id}">Ouvrir</button></div>
              </div>
            `).join('') : '<div class="empty-small">Aucune partie liée à ce compte pour le moment.</div>'}
          </div>
        </div>
      </div>
    `);
  }

  function renderInvalidAdmin(message = 'Ce lien admin n’est pas disponible dans ce navigateur.') {
    setWaitingTicker(null);
    layout('Lien admin', `
      <div class="center-stack">
        <div class="card" style="text-align:center;">
          <h2 class="title-big">Salle admin introuvable</h2>
          <div class="subtle">${escapeHtml(message)}</div>
          <button class="btn" data-action="go-home">Retour</button>
        </div>
      </div>
    `);
  }

  function renderAdminRecovery() {
    setWaitingTicker(null);
    const message = state.ui.adminRecoveryStatus === 'error'
      ? (state.ui.adminRecoveryError || 'Impossible de récupérer la salle en ligne.')
      : 'Récupération de la salle depuis la base en cours…';
    layout('Lien admin', `
      <div class="center-stack">
        <div class="card" style="text-align:center;display:grid;gap:14px;">
          ${state.ui.adminRecoveryStatus === 'error' ? '' : '<div class="spinner"></div>'}
          <h2 class="title-big">${state.ui.adminRecoveryStatus === 'error' ? 'Salle indisponible' : 'Reprise de la salle'}</h2>
          <div class="subtle">${escapeHtml(message)}</div>
          <div class="footer-note">Objectif : garder la salle récupérable en ligne même après refresh.</div>
          <button class="btn" data-action="go-home">Retour</button>
        </div>
      </div>
    `);
  }

  function renderConnectingPlayer(route, session) {
    setWaitingTicker('connecting');
    layout('Connexion', `
      <div class="topbar">
        <button class="btn" data-action="leave-room">Retour</button>
        ${brand()}
        <div class="meta-side">${networkBadge()}</div>
      </div>
      <div class="center-stack">
        ${spinnerBlock('Connexion à la partie')}
        <div class="card" style="text-align:center;">
          <div class="subtle">Salle : ${escapeHtml(route.roomId || '')}</div>
          <div class="subtle">Joueur : ${escapeHtml(session?.pseudo || '')}</div>
          ${state.peerError ? `<div style="margin-top:12px;color:var(--bad);">${escapeHtml(state.peerError)}</div>` : ''}
          <div class="footer-note" style="margin-top:12px;">Si l’admin ferme la page, la salle n’est plus accessible.</div>
        </div>
      </div>
    `);
  }

  function renderAdminLobby(room) {
    setWaitingTicker(null);
    syncItemEditor(room);
    state.ui.themeMode = room.themeMode || 'direct';
    state.ui.theme = room.theme || '';
    layout('Attente de joueurs', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Retour</button>
        ${brand()}
        <div class="meta-side">
          <button class="btn" data-action="start-room" ${room.players.length && state.peerStatus === 'online' ? '' : 'disabled'}>${room.themeMode === 'box' ? 'Tirer au sort et lancer' : 'Lancer la partie'}</button>
          <div class="players-count">${room.players.length} joueur${room.players.length > 1 ? 's' : ''}</div>
          ${networkBadge()}
        </div>
      </div>

      ${roundRestartBanner(room.roundNumber)}
      <div class="row" style="justify-content:space-between;">
        ${themeModeBadge(room)}
        <div class="subtle">${room.themeMode === 'direct' ? `Thème : ${escapeHtml(room.theme || 'À définir')}` : 'Les joueurs peuvent encore proposer des thèmes.'}</div>
      </div>

      <div class="card">
        <div class="form-grid">
          <div style="text-align:left;">
            <div class="label-top">Mode de thème</div>
            <div class="mode-row">
              <button class="mode-btn ${room.themeMode === 'direct' ? 'active' : ''}" data-action="set-theme-mode-direct">Créer le thème moi-même</button>
              <button class="mode-btn ${room.themeMode === 'box' ? 'active' : ''}" data-action="set-theme-mode-box">Lancer avec boîte à thème</button>
            </div>
          </div>
          ${room.themeMode === 'direct' ? `
            <div style="text-align:left;">
              <div class="label-top">Thème de la tier list</div>
              <input id="theme-input" class="text-input" placeholder="Exemple : Qui a le plus de flow ?" value="${escapeHtml(state.ui.theme || room.theme || '')}">
            </div>
          ` : `
            <div style="text-align:left;">
              <div class="label-top">Mode boîte à thème</div>
              <div class="subtle">Au lancement, un thème sera tiré au hasard parmi les thèmes restants dans la boîte.</div>
            </div>
          `}
        </div>
      </div>

      <div class="share-box">
        <div class="label-top">Lien à partager</div>
        <input id="share-url" class="share-url" readonly value="${escapeHtml(makeJoinLink(room))}">
        <div class="row" style="justify-content:space-between;">
          <div class="row">
            <button class="btn" data-action="copy-link">Copier le lien</button>
            <button class="btn" data-action="open-player-link">Me joindre comme joueur</button>
          </div>
          <div class="subtle">${room.themeMode === 'box' ? `${themeBoxCount(room)} thème${themeBoxCount(room) > 1 ? 's' : ''} dans la boîte` : 'Prêt à démarrer'}</div>
        </div>
      </div>

      ${room.themeMode === 'box' ? `
        <div class="theme-box-card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="label-top">Boîte à thème</div>
              <div class="subtle">Ajoute un thème toi aussi ou laisse les joueurs remplir la boîte.</div>
            </div>
            <div class="subtle">${themeBoxCount(room)} proposition${themeBoxCount(room) > 1 ? 's' : ''}</div>
          </div>
          <div class="row" style="margin-top:10px;">
            <input id="admin-theme-box-input" class="text-input" placeholder="Ajouter un thème à la boîte" value="${escapeHtml(state.ui.adminThemeBoxInput)}">
            <button class="btn" data-action="admin-add-theme">Ajouter</button>
          </div>
          <div style="margin-top:12px;">${themeBoxList(room.themeBox, room.usedThemeIds)}</div>
        </div>
      ` : ''}

      <div class="items-card">
        <div class="row" style="justify-content:space-between;">
          <div>
            <div class="label-top">Tableau des noms à classer</div>
            <div class="subtle">Tu peux modifier, ajouter ou supprimer des noms avant de lancer la partie.</div>
          </div>
          <div class="row">
            <button class="btn" data-action="save-items">Sauvegarder</button>
            <button class="btn" data-action="reset-default-items">Remettre la liste de base</button>
          </div>
        </div>
        <div class="items-table" style="margin-top:12px;">
          ${state.ui.itemEditor.map((item, index) => `
            <div class="item-row">
              <input class="text-input" data-item-name-index="${index}" value="${escapeHtml(item)}" placeholder="Nom à classer">
              <div class="item-controls">
                <button class="btn" data-action="delete-item" data-delete-index="${index}">Supprimer</button>
              </div>
            </div>
          `).join('')}
          <div class="item-row">
            <input id="new-item-input" class="text-input" placeholder="Ajouter un nouveau nom" value="${escapeHtml(state.ui.newItemName)}">
            <div class="item-controls">
              <button class="btn" data-action="add-item">Ajouter</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="label-top">Joueurs connectés</div>
        ${room.players.length ? playerPills(room.players) : '<div class="empty-small">Aucun joueur connecté pour le moment.</div>'}
      </div>

      <div class="footer-note">L’admin doit garder cette page ouverte. C’est elle qui héberge la partie.</div>
      ${state.peerError ? `<div style="color:var(--bad);">${escapeHtml(state.peerError)}</div>` : ''}
    `);
  }

  function renderAdminWaiting(room) {
    setWaitingTicker('admin-wait');
    const submitted = room.players.filter((player) => player.submittedAt).length;
    layout('Attente des tiers list', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Accueil</button>
        ${brand()}
        <div class="meta-side">
          <div class="state-pill">${submitted}/${room.players.length}</div>
          ${networkBadge()}
          <div class="subtle">Admin hôte · peut aussi se joindre via le lien</div>
        </div>
      </div>

      <div class="row" style="justify-content:space-between;">
        ${themeModeBadge(room)}
        <div class="subtle">${room.chosenThemeMeta ? `Thème tiré de la boîte par ${escapeHtml(room.chosenThemeMeta.author)}` : 'Classement en cours'}</div>
      </div>

      <div class="waiting-cluster">
        ${spinnerBlock('En attente des tiers list')}
        <div class="card" style="text-align:center;width:min(100%,760px);">
          <div class="label-top">Thème joué</div>
          <div style="font-size:clamp(28px,3.5vw,48px);font-weight:800;">${escapeHtml(room.theme)}</div>
          <div class="subtle" style="margin-top:8px;">Tu peux encore retirer un joueur si besoin pendant l’attente.</div>
        </div>
      </div>

      <div class="waiting-list">
        ${room.players.map((player) => `
          <div class="waiting-row">
            <div class="row" style="gap:12px;">
              <div style="width:18px;height:18px;border-radius:999px;background:${player.color};"></div>
              <strong>${escapeHtml(player.pseudo)}</strong>
            </div>
            <div class="row" style="justify-content:flex-end;">
              <div class="tag ${player.connected ? 'good' : 'bad'}">${player.connected ? 'Connecté' : 'Déconnecté'}</div>
              <div class="tag ${player.submittedAt ? 'good' : 'warn'}">${player.submittedAt ? 'Tier list envoyée' : 'En cours'}</div>
              <button class="btn" data-action="remove-player" data-player-id="${player.id}">Retirer</button>
            </div>
          </div>
        `).join('')}
      </div>
      ${state.peerError ? `<div style="color:var(--bad);">${escapeHtml(state.peerError)}</div>` : ''}
    `);
  }

  function renderAdminResults(room) {
    setWaitingTicker(null);
    ensureResultsReveal(room);
    const revealPhase = state.ui.resultRevealPhase;
    const feedback = feedbackSummary(room);
    if (!state.ui.roomHistoryDraft) state.ui.roomHistoryDraft = room.historyTitle || '';
    const fullList = `
      <div class="results-wrap">
        ${TIERS.map((tier) => {
          const rows = room.finalResults.filter((item) => item.finalTier === tier);
          return `
            <div class="result-row">
              <div class="tier-badge" style="background:${TIER_COLORS[tier]};">${tier}</div>
              <div class="result-track">
                ${rows.length ? rows.map((item) => `
                  <div class="score-chip">
                    <strong>${escapeHtml(item.name)}</strong>
                    <div>${item.score}%</div>
                    <div class="subtle-2">Somme : ${item.sum} pts</div>
                  </div>
                `).join('') : '<div class="subtle">Aucun joueur ici.</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    layout('Résultat final', `
      <div class="topbar">
        <button class="btn" data-action="go-history">Historique</button>
        ${brand()}
        <div class="meta-side">
          <div class="players-count">${room.players.length} joueurs</div>
          ${networkBadge()}
          <div class="subtle">Enregistré dans l’historique</div>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <div class="label-top">Thème</div>
          <div style="font-size:clamp(28px,3.6vw,48px);font-weight:800;">${escapeHtml(room.theme)}</div>
        </div>
        <div class="feedback-bar">
          <span class="tag good">👍 ${feedback.likes}</span>
          <span class="tag bad">👎 ${feedback.dislikes}</span>
        </div>
      </div>
      <div class="card inline-form-card">
        <div class="label-top">Titre dans l’historique</div>
        <div class="row">
          <input id="room-history-input" class="text-input" placeholder="Titre d’historique" value="${escapeHtml(state.ui.roomHistoryDraft)}">
          <button class="btn" data-action="save-room-history-title">Enregistrer</button>
          <button class="btn" data-action="go-player-lists">Voir les tiers list de tous les joueurs</button>
          <button class="btn" data-action="relaunch-same-players">Relancer la partie</button>
          <button class="btn" data-action="go-home">Nouvelle partie</button>
        </div>
      </div>
      ${revealPhase === 'podium' ? podiumMarkup(room.finalResults) : fullList}
    `);
  }

  function renderAdminAllPlayerLists(room) {
    setWaitingTicker(null);
    layout('Tiers list des joueurs', `
      <div class="topbar">
        <button class="btn" data-action="back-to-results">Retour aux résultats</button>
        ${brand()}
        <div class="meta-side">
          <div class="players-count">${room.players.length} joueurs</div>
          <div class="subtle">Vue admin</div>
        </div>
      </div>
      <div class="player-lists-wrap">
        <div class="player-list-grid">
          ${room.players.map((player) => {
            const ranking = room.rankings[player.id] || {};
            return `
              <div class="player-list-card">
                <div class="player-head">
                  <div class="player-name"><span class="color-dot" style="background:${player.color};"></span>${escapeHtml(player.pseudo)}</div>
                  <div class="subtle">${player.submittedAt ? 'Envoyée' : 'Non envoyée'}</div>
                </div>
                <div class="player-tier-mini">
                  ${TIERS.map((tier) => `
                    <div class="player-tier-row">
                      <div class="mini-badge" style="background:${TIER_COLORS[tier]};">${tier}</div>
                      <div class="player-tier-track">
                        ${(room.items || []).filter((name) => ranking[name] === tier).map((name) => `<div class="player-tier-pill">${escapeHtml(name)}</div>`).join('') || '<span class="subtle">—</span>'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `);
  }

  function renderPlayerLobby(snapshot, player) {
    setWaitingTicker(null);
    const mySuggestion = (snapshot.themeBox || []).find((entry) => entry.playerId === player.id)?.text || state.ui.playerThemeInput || '';
    if (!state.ui.playerThemeInput && mySuggestion) state.ui.playerThemeInput = mySuggestion;

    layout('Salle d’attente', `
      <div class="topbar">
        <button class="btn" data-action="leave-room">Retour</button>
        ${brand()}
        <div class="meta-side">
          <div class="players-count">${snapshot.players.length} joueur${snapshot.players.length > 1 ? 's' : ''}</div>
          ${networkBadge()}
          <div class="subtle">Connecté : ${escapeHtml(player.pseudo)}</div>
        </div>
      </div>

      <div class="center-stack">
        ${roundRestartBanner(snapshot.roundNumber)}
        <div class="player-accent"><span class="player-accent-dot" style="background:${player.color};"></span>Écran de ${escapeHtml(player.pseudo)}</div>
        <h2 class="title-big">En attente du lancement…</h2>
        <div class="card player-themed" style="--player-accent:${player.color};text-align:center;">
          <div class="label-top">${snapshot.themeMode === 'box' ? 'Mode' : 'Thème'}</div>
          <div style="font-size:clamp(28px,3.6vw,50px);font-weight:800;">${snapshot.themeMode === 'box' ? 'Boîte à thème' : escapeHtml(snapshot.theme)}</div>
          <div class="subtle" style="margin-top:8px;">${snapshot.themeMode === 'box' ? 'Propose un thème ci-dessous. Un thème sera tiré au hasard au lancement.' : 'L’admin a déjà choisi le thème de la manche.'}</div>
        </div>

        ${snapshot.themeMode === 'box' ? `
          <div class="theme-box-card player-themed" style="--player-accent:${player.color};">
            <div class="row" style="justify-content:space-between;">
              <div>
                <div class="label-top">Ma proposition</div>
                <div class="subtle">Tu peux modifier ton thème tant que la partie n’a pas commencé.</div>
              </div>
              <div class="subtle">${themeBoxCount(snapshot)} thème${themeBoxCount(snapshot) > 1 ? 's' : ''} dans la boîte</div>
            </div>
            <div class="row" style="margin-top:10px;">
              <input id="player-theme-input" class="text-input" placeholder="Écris ton thème" value="${escapeHtml(mySuggestion)}">
              <button class="btn" data-action="player-submit-theme">${mySuggestion ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
            <div style="margin-top:12px;">${themeBoxList(snapshot.themeBox, snapshot.usedThemeIds)}</div>
          </div>
        ` : ''}

        ${playerPills(snapshot.players)}
        ${state.peerError ? `<div style="color:var(--bad);">${escapeHtml(state.peerError)}</div>` : ''}
      </div>
    `);
  }

  function renderPlayerRanking(snapshot, player, roomId) {
    setWaitingTicker(null);
    const items = snapshot.items || DEFAULT_ITEMS;
    const draft = loadDraft(roomId, player.id);
    const placed = items.filter((item) => draft[item]).length;
    const remaining = items.filter((item) => !draft[item]);
    const submittedCount = snapshot.players.filter((entry) => entry.submittedAt).length;
    const meInSnapshot = snapshot.players.find((entry) => entry.id === player.id);
    const alreadySent = !!meInSnapshot?.submittedAt;

    layout('Tier list joueur', `
      <div class="topbar">
        <button class="btn" data-action="leave-room">Quitter</button>
        ${brand()}
        <div class="meta-side">
          <div class="state-pill">${submittedCount}/${snapshot.players.length}</div>
          ${networkBadge()}
          <div class="subtle">${escapeHtml(player.pseudo)}</div>
        </div>
      </div>

      <div class="main-grid">
        <div class="board-wrap">
          <div class="board-card player-themed player-banner" style="--player-accent:${player.color};">
            <div class="row" style="justify-content:space-between;">
              <div>
                <div class="label-top">Thème</div>
                <div style="font-size:clamp(24px,3vw,42px);font-weight:800;">${escapeHtml(snapshot.theme)}</div>
              </div>
              <div class="player-accent"><span class="player-accent-dot" style="background:${player.color};"></span>${escapeHtml(player.pseudo)}</div>
            </div>
            <div class="subtle" style="margin-top:6px;">Classe les ${items.length} personnes. Ton écran reprend ta couleur pour qu’on voie tout de suite qui joue ici.</div>
          </div>

          <div class="pool-zone dropzone" data-tier="UNASSIGNED">
            ${remaining.length ? remaining.map((name) => personCard(name, null)).join('') : '<div class="subtle">Tous les noms sont classés.</div>'}
          </div>

          ${TIERS.map((tier) => `
            <div class="tier-row">
              <div class="tier-badge" style="background:${TIER_COLORS[tier]};">${tier}</div>
              <div class="tier-drop dropzone" data-tier="${tier}">
                ${items.filter((name) => draft[name] === tier).map((name) => personCard(name, tier)).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="side-stack">
          <div class="status-card player-themed" style="--player-accent:${player.color};">
            <div class="label-top">Progression</div>
            <div style="font-size:42px;font-weight:900;">${placed}/${items.length}</div>
            <div class="subtle">Place tous les noms avant d’envoyer.</div>
          </div>

          <div class="status-card player-themed" style="--player-accent:${player.color};">
            <div class="label-top">État de ma tier list</div>
            <div class="subtle">${alreadySent ? 'Ta tier list est déjà envoyée. Tu peux encore la modifier tant que tout le monde n’a pas fini.' : 'Tu n’as pas encore envoyé ta tier list.'}</div>
            <div class="row" style="margin-top:10px;">
              <div class="tag ${alreadySent ? 'good' : 'warn'}">${alreadySent ? 'Envoyée' : 'À envoyer'}</div>
              <div class="tag">${submittedCount}/${snapshot.players.length} joueurs ont envoyé</div>
            </div>
          </div>

          <div class="status-card">
            <div class="label-top">Score final</div>
            <div class="score-list">
              <div>S = 5 pts</div>
              <div>A = 4 pts</div>
              <div>B = 3 pts</div>
              <div>C = 2 pts</div>
              <div>D = 1 pt</div>
              <div>E = 0 pt</div>
              <div style="margin-top:8px;">Score = ((Somme_pts / nbJoueurs) / 5) × 100</div>
            </div>
          </div>

          <button class="big-btn submit-btn" data-action="submit-ranking">${alreadySent ? 'Mettre à jour ma tier list' : 'Envoyer ma tier list'}</button>
          ${state.peerError ? `<div style="color:var(--bad);font-size:14px;">${escapeHtml(state.peerError)}</div>` : ''}
        </div>
      </div>
    `);
  }

  function renderPlayerResults(snapshot, player) {
    setWaitingTicker(null);
    saveHistoryEntryFromSnapshot(snapshot);
    const feedback = feedbackSummary(snapshot, player.id);
    const fullList = `
      <div class="results-wrap">
        ${TIERS.map((tier) => {
          const rows = (snapshot.finalResults || []).filter((item) => item.finalTier === tier);
          return `
            <div class="result-row">
              <div class="tier-badge" style="background:${TIER_COLORS[tier]};">${tier}</div>
              <div class="result-track">
                ${rows.length ? rows.map((item) => `
                  <div class="score-chip">
                    <strong>${escapeHtml(item.name)}</strong>
                    <div>${item.score}%</div>
                    <div class="subtle-2">Somme : ${item.sum} pts</div>
                  </div>
                `).join('') : '<div class="subtle">Aucun joueur ici.</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    layout('Résultat final', `
      <div class="topbar">
        <button class="btn" data-action="go-home">Accueil</button>
        ${brand()}
        <div class="meta-side">
          <div class="players-count">${snapshot.players.length} joueurs</div>
          ${networkBadge()}
          <div class="subtle">${escapeHtml(player.pseudo)}</div>
        </div>
      </div>
      <div class="center-stack" style="justify-content:flex-start;">
        <div class="player-accent"><span class="player-accent-dot" style="background:${player.color};"></span>Écran de ${escapeHtml(player.pseudo)}</div>
        <div class="card player-themed" style="--player-accent:${player.color};text-align:center;width:min(100%,980px);">
          <div class="label-top">Thème</div>
          <div style="font-size:clamp(28px,3.6vw,46px);font-weight:800;">${escapeHtml(snapshot.theme)}</div>
          <div class="feedback-actions" style="margin-top:14px;">
            <button class="btn ${feedback.mine === 'like' ? 'is-active-like' : ''}" data-action="vote-like">👍 J’aime · ${feedback.likes}</button>
            <button class="btn ${feedback.mine === 'dislike' ? 'is-active-dislike' : ''}" data-action="vote-dislike">👎 J’aime pas · ${feedback.dislikes}</button>
          </div>
        </div>
        ${fullList}
      </div>
    `);
  }

  function renderHistory() {
    setWaitingTicker(null);
    const history = historyStore();
    const emptyCards = Array.from({ length: 3 }).map((_, index) => `
      <div class="history-card">
        <div class="history-mini-board">${miniRows([])}</div>
        <div class="history-card-title">Aucune partie sauvegardée</div>
        <div class="history-card-meta">Lance une partie pour remplir cet historique.</div>
        <div class="history-actions">${index === 0 ? '<button class="btn" data-action="go-create">Créer une partie</button>' : ''}</div>
      </div>
    `).join('');

    layout('Historiques', `
      <div class="topbar history-topbar">
        <button class="btn" data-action="go-home">Retour</button>
        ${brand({ compact: true })}
        <div style="width:96px;"></div>
      </div>
      <div class="row" style="justify-content:center;margin-top:4px;">
        <h2 class="title-big" style="font-size:clamp(26px,3vw,44px);">Historique</h2>
      </div>
      <div class="history-grid-wrap">
        <div class="history-grid">
          ${history.length ? history.map((entry) => `
            <div class="history-card">
              <div class="history-mini-board">${miniRows(entry.results)}</div>
              ${state.ui.editHistoryId === entry.id ? `
                <div class="inline-rename">
                  <input id="history-rename-input" class="text-input" value="${escapeHtml(state.ui.editHistoryValue)}" placeholder="Titre d’historique">
                  <div class="history-actions">
                    <button class="btn" data-action="save-history-inline" data-entry-id="${entry.id}">Enregistrer</button>
                    <button class="btn" data-action="cancel-history-inline">Annuler</button>
                  </div>
                </div>
              ` : `
                <div class="history-card-title">${escapeHtml(entry.title)}</div>
                <div class="history-card-meta">${entry.playersCount} joueurs · Manche ${entry.roundNumber || 1} · ${formatDate(entry.completedAt)}</div>
                <div class="history-actions">
                  <button class="btn" data-history-open="${entry.id}">Ouvrir</button>
                  <button class="btn" data-action="edit-history-inline" data-entry-id="${entry.id}">Renommer</button>
                </div>
              `}
            </div>
          `).join('') : emptyCards}
        </div>
      </div>
    `);
  }

  function renderHistoryDetail(entry) {
    setWaitingTicker(null);
    if (!entry) {
      layout('Historique', `
        <div class="center-stack">
          <div class="card" style="text-align:center;">
            <h2 class="title-big">Résultat introuvable</h2>
            <button class="btn" data-action="go-history">Retour</button>
          </div>
        </div>
      `);
      return;
    }

    layout('Zoom - Historiques', `
      <div class="topbar">
        <button class="btn" data-action="go-history">Retour</button>
        ${brand()}
        <div class="meta-side">
          <div class="players-count">${entry.playersCount} joueurs</div>
        </div>
      </div>
      <div class="card inline-form-card">
        <div class="label-top">Titre dans l’historique</div>
        <div class="row">
          <input id="history-rename-input" class="text-input" value="${escapeHtml(state.ui.editHistoryId === entry.id ? state.ui.editHistoryValue : entry.title)}" placeholder="Titre d’historique">
          <button class="btn" data-action="save-history-inline" data-entry-id="${entry.id}">Enregistrer</button>
        </div>
      </div>
      <div style="text-align:center;">
        <div class="label-top">Résultat</div>
        <div style="font-size:clamp(28px,3.4vw,46px);font-weight:500;line-height:1.15;">${escapeHtml(entry.title)}</div>
        <div class="subtle">${escapeHtml(entry.theme)} · ${formatDate(entry.completedAt)}</div>
      </div>
      <div class="results-wrap">
        ${TIERS.map((tier) => {
          const rows = entry.results.filter((item) => item.finalTier === tier);
          return `
            <div class="result-row">
              <div class="tier-badge" style="background:${TIER_COLORS[tier]};">${tier}</div>
              <div class="result-track">
                ${rows.length ? rows.map((item) => `
                  <div class="score-chip">
                    <strong>${escapeHtml(item.name)}</strong>
                    <div>${item.score}%</div>
                    <div class="subtle-2">Somme : ${item.sum} pts</div>
                  </div>
                `).join('') : '<div class="subtle">Aucun joueur ici.</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `);
  }

  function render() {
    const route = getRoute();

    if (!(route.roomId && (route.adminToken || route.playerId)) && state.role) {
      resetNetwork();
    }

    if (route.roomId && route.adminToken) {
      const room = loadActiveRoom(route.roomId);
      if (!room || room.adminToken !== route.adminToken) {
        if (triggerAdminRoomRecovery(route)) {
          renderAdminRecovery();
          return;
        }
        if (state.ui.adminRecoveryStatus === 'error' && state.ui.adminRecoveryKey === `${route.roomId}:${route.adminToken}`) {
          renderInvalidAdmin(state.ui.adminRecoveryError);
          return;
        }
        renderInvalidAdmin();
        return;
      }
      state.ui.adminRecoveryStatus = 'idle';
      ensureAdminHosting(room);
      if (route.hash === '#player-lists' && state.room.status === 'results') {
        renderAdminAllPlayerLists(state.room);
        return;
      }
      if (state.room.status === 'lobby') renderAdminLobby(state.room);
      else if (state.room.status === 'ranking') renderAdminWaiting(state.room);
      else renderAdminResults(state.room);
      return;
    }

    if (route.roomId && route.playerId) {
      const session = loadPlayerSession(route.roomId);
      if (!session || session.playerId !== route.playerId) {
        layout('Connexion', `
          <div class="center-stack">
            <div class="card" style="text-align:center;">
              <h2 class="title-big">Session joueur introuvable</h2>
              <div class="subtle">Ce lien joueur n’est pas disponible dans ce navigateur.</div>
              <button class="btn" data-action="go-home">Retour</button>
            </div>
          </div>
        `);
        return;
      }

      ensurePlayerConnection(route);
      const snapshot = state.snapshot;
      if (!snapshot) {
        renderConnectingPlayer(route, session);
        return;
      }
      const player = snapshot.players.find((entry) => entry.id === route.playerId) || { ...session, submittedAt: null, connected: true };
      if (snapshot.status === 'lobby') {
        renderPlayerLobby(snapshot, player);
        return;
      }
      if (snapshot.status === 'ranking') {
        renderPlayerRanking(snapshot, player, route.roomId);
        return;
      }
      renderPlayerResults(snapshot, player);
      return;
    }

    if (route.joinId) {
      renderJoin(route);
      return;
    }

    if (route.hash === '#account') {
      renderAccount();
      return;
    }

    if (route.hash === '#profile') {
      renderProfile();
      return;
    }

    if (route.hash.startsWith('#history/')) {
      const entryId = route.hash.replace('#history/', '');
      renderHistoryDetail(historyStore().find((entry) => entry.id === entryId));
      return;
    }

    if (route.hash === '#history') {
      renderHistory();
      return;
    }

    if (route.hash === '#create') {
      renderCreate();
      return;
    }

    renderHome();
  }

  function setupDnD() {
    const route = getRoute();
    if (!route.roomId || !route.playerId || !document.querySelector('.dropzone')) return;
    const clearHover = () => document.querySelectorAll('.dropzone').forEach((zone) => zone.classList.remove('drag-over'));

    document.querySelectorAll('.person-card').forEach((card) => {
      card.addEventListener('dragstart', () => {
        state.ui.draggingItem = card.dataset.item;
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        state.ui.draggingItem = null;
        card.classList.remove('dragging');
        clearHover();
      });

      card.addEventListener('touchstart', () => {
        state.ui.touchDrag = { item: card.dataset.item };
        card.classList.add('dragging');
      }, { passive: true });

      card.addEventListener('touchmove', (event) => {
        if (!state.ui.touchDrag) return;
        const touch = event.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        clearHover();
        const zone = target?.closest('.dropzone');
        if (zone) zone.classList.add('drag-over');
        event.preventDefault();
      }, { passive: false });

      card.addEventListener('touchend', (event) => {
        if (!state.ui.touchDrag) return;
        const touch = event.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const zone = target?.closest('.dropzone');
        if (zone) moveDraftItem(route.roomId, route.playerId, state.ui.touchDrag.item, zone.dataset.tier);
        state.ui.touchDrag = null;
        card.classList.remove('dragging');
        clearHover();
      });

      card.addEventListener('touchcancel', () => {
        state.ui.touchDrag = null;
        card.classList.remove('dragging');
        clearHover();
      });
    });
    document.querySelectorAll('.dropzone').forEach((zone) => {
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('drag-over');
        if (!state.ui.draggingItem) return;
        moveDraftItem(route.roomId, route.playerId, state.ui.draggingItem, zone.dataset.tier);
      });
    });
  }

  document.addEventListener('input', (event) => {
    if (event.target.id === 'theme-input') {
      state.ui.theme = event.target.value;
      if (state.role === 'admin' && state.room && state.room.status === 'lobby' && state.room.themeMode === 'direct') {
        state.room.theme = event.target.value;
        saveActiveRoom(state.room);
        broadcastSnapshot();
      }
    }
    if (event.target.id === 'history-title-input') state.ui.historyTitle = event.target.value;
    if (event.target.id === 'join-pseudo') state.ui.joinPseudo = event.target.value;
    if (event.target.id === 'new-item-input') state.ui.newItemName = event.target.value;
    if (event.target.id === 'set-name-input') state.ui.newSetName = event.target.value;
    if (event.target.id === 'room-history-input') state.ui.roomHistoryDraft = event.target.value;
    if (event.target.id === 'history-rename-input') state.ui.editHistoryValue = event.target.value;
    if (event.target.id === 'admin-theme-box-input') state.ui.adminThemeBoxInput = event.target.value;
    if (event.target.id === 'player-theme-input') state.ui.playerThemeInput = event.target.value;
    if (event.target.id === 'auth-login-email') state.ui.authLoginEmail = event.target.value;
    if (event.target.id === 'auth-login-password') state.ui.authLoginPassword = event.target.value;
    if (event.target.id === 'auth-forgot-email') state.ui.authForgotEmail = event.target.value;
    if (event.target.id === 'auth-forgot-password') state.ui.authForgotPassword = event.target.value;
    if (event.target.id === 'auth-forgot-confirm') state.ui.authForgotConfirm = event.target.value;
    if (event.target.id === 'auth-register-name') state.ui.authRegisterName = event.target.value;
    if (event.target.id === 'auth-register-email') state.ui.authRegisterEmail = event.target.value;
    if (event.target.id === 'auth-register-password') state.ui.authRegisterPassword = event.target.value;
    if (event.target.id === 'auth-other-name') state.ui.authOtherName = event.target.value;
    if (event.target.id === 'auth-persona-select') state.ui.authPersonaId = event.target.value;
    if (event.target.dataset.itemNameIndex !== undefined) {
      state.ui.itemEditor[Number(event.target.dataset.itemNameIndex)] = event.target.value;
    }
  });

  document.addEventListener('click', async (event) => {
    const authColorButton = event.target.closest('[data-auth-color]');
    if (authColorButton) {
      state.ui.authProfileColor = authColorButton.dataset.authColor;
      render();
      return;
    }

    const colorButton = event.target.closest('[data-color]');
    if (colorButton) {
      state.ui.joinColor = colorButton.dataset.color;
      render();
      return;
    }

    const moveButton = event.target.closest('[data-move-item]');
    if (moveButton) {
      const route = getRoute();
      if (!route.roomId || !route.playerId) return;
      moveDraftItem(route.roomId, route.playerId, moveButton.dataset.moveItem, moveButton.dataset.targetTier);
      return;
    }

    const historyOpen = event.target.closest('[data-history-open]');
    if (historyOpen) {
      setRoute({}, `#history/${historyOpen.dataset.historyOpen}`);
      render();
      return;
    }


    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const route = getRoute();

    if (action === 'go-home') {
      setRoute({}, '');
      render();
      return;
    }
    if (action === 'music-toggle') {
      toggleMusic();
      return;
    }
    if (action === 'go-create') {
      setRoute({}, '#create');
      render();
      return;
    }
    if (action === 'go-account') {
      setRoute({}, '#account');
      render();
      return;
    }
    if (action === 'go-profile') {
      setRoute({}, '#profile');
      render();
      return;
    }
    if (action === 'go-history') {
      setRoute({}, '#history');
      render();
      return;
    }
    if (action === 'go-player-lists') {
      setRoute({ room: route.roomId, admin: route.adminToken }, '#player-lists');
      render();
      return;
    }
    if (action === 'back-to-results') {
      setRoute({ room: route.roomId, admin: route.adminToken }, '');
      render();
      return;
    }
    if (action === 'relaunch-same-players') {
      relaunchSamePlayers();
      return;
    }
    if (action === 'set-theme-mode-direct') {
      state.ui.themeMode = 'direct';
      if (state.role === 'admin' && state.room && state.room.status === 'lobby') {
        state.room.themeMode = 'direct';
        state.room.theme = state.ui.theme || state.room.theme || '';
        saveActiveRoom(state.room);
        broadcastSnapshot();
      }
      render();
      return;
    }
    if (action === 'set-theme-mode-box') {
      state.ui.themeMode = 'box';
      if (state.role === 'admin' && state.room && state.room.status === 'lobby') {
        state.room.themeMode = 'box';
        state.room.theme = '';
        saveActiveRoom(state.room);
        broadcastSnapshot();
      }
      render();
      return;
    }
    if (action === 'switch-auth-register') {
      state.ui.authTab = 'register';
      render();
      return;
    }
    if (action === 'switch-auth-login') {
      state.ui.authTab = 'login';
      render();
      return;
    }
    if (action === 'switch-auth-forgot') {
      state.ui.authTab = 'forgot';
      state.ui.authForgotEmail = state.ui.authForgotEmail || state.ui.authLoginEmail || state.ui.authRegisterEmail || '';
      render();
      return;
    }
    if (action === 'auth-link-none') {
      state.ui.authLinkMode = 'none';
      render();
      return;
    }
    if (action === 'auth-link-core') {
      state.ui.authLinkMode = 'core';
      const first = availableCorePersonas(getCurrentUser()?.id)[0];
      if (first) state.ui.authPersonaId = first.id;
      render();
      return;
    }
    if (action === 'auth-link-other') {
      state.ui.authLinkMode = 'other';
      render();
      return;
    }
    if (action === 'create-account') {
      const result = await createAccountFromUi();
      if (!result.ok) { setNotice(result.error, 'bad'); return; }
      setNotice(result.message || 'Compte créé. Tu peux maintenant jouer et suivre tes stats.', 'ok');
      if (route.joinId) {
        state.ui.joinAuthExpanded = false;
        render();
      } else {
        setRoute({}, '#profile');
        render();
      }
      return;
    }
    if (action === 'login-account') {
      const result = await loginAccountFromUi();
      if (!result.ok) { setNotice(result.error, 'bad'); return; }
      setNotice(result.message || 'Connexion réussie.', 'ok');
      if (route.joinId) {
        state.ui.joinAuthExpanded = false;
        render();
      } else {
        setRoute({}, '#profile');
        render();
      }
      return;
    }
    if (action === 'reset-password') {
      const result = await resetPasswordFromUi();
      if (!result.ok) { setNotice(result.error, 'bad'); return; }
      setNotice(result.message || 'Mot de passe réinitialisé. Tu peux maintenant te connecter.', 'ok', 4200);
      if (route.joinId) state.ui.joinAuthExpanded = true;
      render();
      return;
    }
    if (action === 'logout-account') {
      await logoutAccount();
      setNotice('Déconnexion effectuée.', 'ok');
      setRoute({}, '');
      render();
      return;
    }
    if (action === 'save-profile') {
      const result = await updateAccountFromUi();
      if (!result.ok) { setNotice(result.error, 'bad'); return; }
      setNotice('Profil enregistré.', 'ok');
      render();
      return;
    }
    if (action === 'add-other-persona') {
      const persona = personaById(button.dataset.personaId);
      if (persona && !state.ui.itemEditor.some((item) => item.toLowerCase() === persona.name.toLowerCase())) {
        state.ui.itemEditor.push(persona.name);
        setNotice(`${persona.name} ajouté au set courant.`, 'ok');
      }
      render();
      return;
    }

    if (action === 'create-room') {
      const theme = (state.ui.theme || '').trim();
      if (state.ui.themeMode === 'direct' && !theme) {
        setNotice('Entre un thème pour la tier list.', 'warn');
        return;
      }
      createRoom(theme, state.ui.historyTitle || '', state.ui.themeMode);
      return;
    }
    if (action === 'copy-link') {
      const value = document.getElementById('share-url')?.value || '';
      navigator.clipboard?.writeText(value)
        .then(() => setNotice('Lien copié.', 'ok'))
        .catch(() => {
          const input = document.getElementById('share-url');
          if (input) {
            input.select();
            document.execCommand('copy');
          }
          setNotice('Lien copié.', 'ok');
        });
      return;
    }
    if (action === 'join-auth-show') {
      state.ui.joinAuthExpanded = true;
      render();
      return;
    }
    if (action === 'join-auth-hide') {
      state.ui.joinAuthExpanded = false;
      render();
      return;
    }
    if (action === 'open-player-link') {
      const sourceRoute = getRoute();
      const joinRoute = sourceRoute.joinId ? sourceRoute : { ...sourceRoute, joinId: state.room?.joinToken || state.room?.id || '' };
      await joinRoom(joinRoute, { openInNewTab: true });
      return;
    }
    if (action === 'join-room') {
      const taken = usedColors(state.ui.joinPreview);
      if (taken.has(state.ui.joinColor)) {
        setNotice('Cette couleur est déjà prise.', 'warn');
        return;
      }
      await joinRoom(route);
      return;
    }
    if (action === 'leave-room') {
      leavePlayerRoom();
      return;
    }
    if (action === 'start-room') {
      startRoom();
      return;
    }
    if (action === 'submit-ranking') {
      submitRanking(route.roomId, route.playerId, state.snapshot?.items || state.room?.items || DEFAULT_ITEMS);
      return;
    }
    if (action === 'save-room-history-title') {
      updateRoomHistoryTitle(state.ui.roomHistoryDraft || '');
      return;
    }
    if (action === 'save-current-set') {
      saveCurrentItemsAsSet();
      return;
    }
    if (action === 'load-set') {
      loadSetIntoEditor(button.dataset.setId);
      return;
    }
    if (action === 'delete-set') {
      deleteItemSet(button.dataset.setId);
      return;
    }
    if (action === 'edit-history-inline') {
      const entry = historyStore().find((item) => item.id === button.dataset.entryId);
      if (!entry) return;
      state.ui.editHistoryId = entry.id;
      state.ui.editHistoryValue = entry.title;
      render();
      return;
    }
    if (action === 'cancel-history-inline') {
      state.ui.editHistoryId = null;
      state.ui.editHistoryValue = '';
      render();
      return;
    }
    if (action === 'save-history-inline') {
      const entryId = button.dataset.entryId;
      updateHistoryTitle(entryId, state.ui.editHistoryValue || '');
      state.ui.editHistoryId = null;
      state.ui.editHistoryValue = '';
      return;
    }
    if (action === 'vote-like') {
      sendFeedbackVote(feedbackSummary(state.snapshot, route.playerId).mine === 'like' ? 'none' : 'like');
      return;
    }
    if (action === 'vote-dislike') {
      sendFeedbackVote(feedbackSummary(state.snapshot, route.playerId).mine === 'dislike' ? 'none' : 'dislike');
      return;
    }
    if (action === 'save-items') {
      saveItemEditorToRoom();
      return;
    }
    if (action === 'reset-default-items') {
      state.ui.itemEditor = [...DEFAULT_ITEMS];
      state.ui.selectedSetId = null;
      render();
      return;
    }
    if (action === 'add-item') {
      const name = String(state.ui.newItemName || '').trim();
      if (!name) return;
      state.ui.itemEditor.push(name);
      state.ui.newItemName = '';
      render();
      return;
    }
    if (action === 'delete-item') {
      const index = Number(button.dataset.deleteIndex);
      state.ui.itemEditor.splice(index, 1);
      render();
      return;
    }
    if (action === 'remove-player') {
      adminRemovePlayer(button.dataset.playerId);
      return;
    }
    if (action === 'admin-add-theme') {
      submitThemeSuggestionFromAdmin(state.ui.adminThemeBoxInput);
      state.ui.adminThemeBoxInput = '';
      return;
    }
    if (action === 'player-submit-theme') {
      submitThemeSuggestionFromPlayer(route, state.ui.playerThemeInput);
      return;
    }
    if (action === 'skip-reveal') {
      skipReveal();
      return;
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', () => {
    if (state.room && state.role === 'admin') saveActiveRoom(state.room);
    if (state.ui.waitingTicker) clearInterval(state.ui.waitingTicker);
    if (state.ui.resultTimer) clearTimeout(state.ui.resultTimer);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === HISTORY_KEY || event.key?.startsWith(ACTIVE_ROOM_PREFIX)) render();
  });

  ensureAccountSeedData();
  syncJoinDefaultsFromAccount();
  dbBootstrap();
  render();
})();
