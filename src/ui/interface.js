import { FACT_LABELS } from '../data/celestialBodies.js';
import { SATELLITES_BY_PARENT } from '../data/satellites.js';

export function parseEphemerisDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError('日期格式必须为 YYYY-MM-DD。');
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year < 1800 || year > 2050) {
    throw new RangeError('星历日期必须在 1800 至 2050 年之间。');
  }
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day) {
    throw new RangeError('请输入有效的日历日期。');
  }
  return date;
}

function required(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少界面节点: ${id}`);
  return element;
}

export function createInterface(bodies, callbacks = {}) {
  const elements = {
    loading: required('loading-screen'),
    loadingProgress: required('loading-progress'),
    loadingPercent: required('loading-percent'),
    loadingStatus: required('loading-status'),
    intro: required('intro-screen'),
    start: required('start-exploring'),
    app: required('app-shell'),
    bodyNav: required('body-nav'),
    info: required('info-panel'),
    infoEnglish: required('info-english'),
    infoName: required('info-name'),
    infoDescription: required('info-description'),
    infoFacts: required('info-facts'),
    closeInfo: required('close-info'),
    play: required('play-toggle'),
    speedLabel: required('speed-label'),
    speedOptions: required('speed-options'),
    resetTime: required('reset-time'),
    date: required('ephemeris-date'),
    dateLabel: required('date-label'),
    dateModeOptions: required('date-mode-options'),
    today: required('today-button'),
    settings: required('settings-panel'),
    settingsButton: required('settings-button'),
    closeSettings: required('close-settings'),
    installApp: required('install-app-button'),
    pwaStatus: required('pwa-status'),
    pwaStatusMessage: required('pwa-status-message'),
    updateApp: required('update-app-button'),
    overview: required('overview-button'),
    sound: required('sound-button'),
    fullscreen: required('fullscreen-button'),
    cruise: required('cruise-button'),
    orbits: required('toggle-orbits'),
    asteroids: required('toggle-asteroids'),
    labels: required('toggle-labels'),
    diagnosticsToggle: required('toggle-diagnostics'),
    diagnostics: required('performance-hud'),
    diagnosticsFps: required('diagnostics-fps'),
    diagnosticsP1Fps: required('diagnostics-p1-fps'),
    diagnosticsDrawCalls: required('diagnostics-draw-calls'),
    diagnosticsTriangles: required('diagnostics-triangles'),
    diagnosticsMemory: required('diagnostics-memory'),
    scaleOptions: required('scale-options'),
    qualityOptions: required('quality-options'),
    depthOfField: required('toggle-depth-of-field'),
    depthOfFieldRow: required('depth-of-field-row'),
    depthOfFieldHint: required('depth-of-field-hint'),
    hover: required('hover-label'),
    hoverName: required('hover-name'),
    hoverEnglish: required('hover-english'),
    toast: required('toast'),
    viewState: required('view-state'),
    error: required('webgl-error'),
    errorMessage: required('error-message'),
  };

  const listeners = [];
  let toastTimer = 0;
  let loadingTimer = 0;
  let settingsOpen = false;
  let cruising = false;

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }

  function createBodyNavigation() {
    const fragment = document.createDocumentFragment();
    bodies.forEach((body) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.bodyId = body.id;
      button.setAttribute('aria-label', `聚焦${body.name}`);
      const orb = document.createElement('span');
      orb.className = 'nav-orb';
      orb.style.setProperty('--orb-color', body.colors[1]);
      orb.style.setProperty('--orb-size', `${Math.min(17, Math.max(6, 5 + Math.sqrt(body.displayRadius) * 3.1))}px`);
      orb.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'nav-name';
      name.textContent = body.name;
      button.append(orb, name);
      listen(button, 'click', () => callbacks.onFocus?.(body.id));
      fragment.append(button);
    });
    elements.bodyNav.append(fragment);
  }

  function setLoading(progress, status) {
    const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
    elements.loadingProgress.style.width = `${Math.round(normalized * 100)}%`;
    elements.loadingPercent.textContent = `${Math.round(normalized * 100)}%`;
    if (status) elements.loadingStatus.textContent = status;
  }

  function completeLoading() {
    setLoading(1, '星图校准完成');
    window.clearTimeout(loadingTimer);
    loadingTimer = window.setTimeout(() => {
      loadingTimer = 0;
      elements.loading.hidden = true;
      elements.intro.hidden = false;
      document.body.dataset.appState = 'intro';
    }, 420);
  }

  function enableStart() {
    elements.start.disabled = false;
  }

  function enterApp() {
    elements.intro.hidden = true;
    elements.app.hidden = false;
    document.body.dataset.appState = 'exploring';
  }

  function setActiveBody(id) {
    elements.bodyNav.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.bodyId === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active && matchMedia('(max-width: 768px)').matches) {
        const left = button.offsetLeft - (elements.bodyNav.clientWidth - button.clientWidth) / 2;
        elements.bodyNav.scrollTo({ left, behavior: 'smooth' });
      }
    });
  }

  function showBody(body) {
    if (!body) return;
    elements.infoEnglish.textContent = body.englishName;
    elements.infoName.textContent = body.name;
    elements.infoDescription.textContent = body.description;
    elements.infoFacts.replaceChildren();
    const fragment = document.createDocumentFragment();
    Object.entries(body.facts).forEach(([key, value]) => {
      const wrapper = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = FACT_LABELS[key] || key;
      detail.textContent = value;
      wrapper.append(term, detail);
      fragment.append(wrapper);
    });
    const majorSatellites = SATELLITES_BY_PARENT.get(body.id) || [];
    if (majorSatellites.length) {
      const wrapper = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = '主要卫星';
      detail.textContent = majorSatellites.map(({ name }) => name).join(' · ');
      wrapper.append(term, detail);
      fragment.append(wrapper);
    }
    elements.infoFacts.append(fragment);
    elements.info.classList.add('is-visible');
    elements.info.setAttribute('aria-hidden', 'false');
    setActiveBody(body.id);
  }

  function hideInfo() {
    elements.info.classList.remove('is-visible');
    elements.info.setAttribute('aria-hidden', 'true');
    setActiveBody(null);
  }

  function setHover(body, position) {
    if (!body || !position) return;
    elements.hoverName.textContent = body.name;
    elements.hoverEnglish.textContent = body.englishName;
    elements.hover.style.left = `${position.x}px`;
    elements.hover.style.top = `${position.y}px`;
    elements.hover.hidden = false;
  }

  function hideHover() {
    elements.hover.hidden = true;
  }

  function setPlaying(playing) {
    elements.play.classList.toggle('is-paused', !playing);
    elements.play.setAttribute('aria-pressed', String(playing));
    elements.play.setAttribute('aria-label', playing ? '暂停时间' : '继续时间');
  }

  function setMultiplier(multiplier) {
    elements.speedLabel.textContent = `${multiplier}×`;
    elements.speedOptions.querySelectorAll('[data-speed]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.speed) === Number(multiplier));
    });
  }

  function setDate(isoDate) {
    elements.date.value = isoDate;
    elements.dateLabel.textContent = isoDate;
  }

  function setDateMode(mode) {
    elements.dateModeOptions.querySelectorAll('[data-date-mode]').forEach((button) => {
      const active = button.dataset.dateMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setScaleMode(mode) {
    elements.scaleOptions.querySelectorAll('[data-scale]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.scale === mode);
    });
  }

  function setQuality(quality, mode = 'manual') {
    elements.qualityOptions.querySelectorAll('[data-quality]').forEach((button) => {
      const activeQuality = mode === 'auto' ? 'auto' : quality;
      button.classList.toggle('is-active', button.dataset.quality === activeQuality);
    });
  }

  function setDepthOfField({ enabled, available }) {
    elements.depthOfField.checked = Boolean(enabled) && Boolean(available);
    elements.depthOfField.disabled = !available;
    elements.depthOfFieldRow.classList.toggle('is-disabled', !available);
    elements.depthOfFieldHint.textContent = available
      ? '仅在电脑高画质聚焦时生效'
      : '景深仅在电脑高画质聚焦时可用';
  }

  function setDiagnosticsVisible(visible) {
    const active = Boolean(visible);
    elements.diagnostics.hidden = !active;
    elements.diagnosticsToggle.checked = active;
  }

  function setDiagnostics(snapshot = {}) {
    const fixed = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
    elements.diagnosticsFps.textContent = fixed(snapshot.fps, 1);
    elements.diagnosticsP1Fps.textContent = fixed(snapshot.p1Fps, 1);
    elements.diagnosticsDrawCalls.textContent = fixed(snapshot.render?.calls);
    elements.diagnosticsTriangles.textContent = fixed(snapshot.render?.triangles);
    elements.diagnosticsMemory.textContent = `${fixed(snapshot.memory?.textures)} / ${fixed(snapshot.memory?.geometries)}`;
  }

  function setCruising(active) {
    cruising = Boolean(active);
    elements.cruise.classList.toggle('is-active', cruising);
    elements.cruise.setAttribute('aria-pressed', String(cruising));
    elements.cruise.textContent = cruising ? '停止自动巡航' : '开始自动巡航';
  }

  function setViewState(state) {
    const labels = {
      INTRO: '开场校准',
      OVERVIEW: '自由探索',
      FOCUSED: '行星观察',
      CRUISE: '自动巡航',
    };
    elements.viewState.textContent = labels[state] || '自由探索';
    if (state !== 'CRUISE' && cruising) setCruising(false);
  }

  function setSoundEnabled(active) {
    elements.sound.setAttribute('aria-pressed', String(Boolean(active)));
    elements.sound.setAttribute('aria-label', active ? '关闭环境音效' : '开启环境音效');
  }

  function setPwaState({ installAvailable = false, offlineReady = false, updateAvailable = false } = {}) {
    elements.installApp.hidden = !installAvailable;
    elements.installApp.dataset.state = installAvailable ? 'installAvailable' : '';
    elements.updateApp.hidden = !updateAvailable;

    if (updateAvailable) {
      elements.pwaStatus.hidden = false;
      elements.pwaStatus.dataset.state = 'updateAvailable';
      elements.pwaStatusMessage.textContent = '发现新版本，可在准备好后更新';
      document.body.dataset.pwaState = 'updateAvailable';
      return;
    }
    if (offlineReady) {
      elements.pwaStatus.hidden = false;
      elements.pwaStatus.dataset.state = 'offlineReady';
      elements.pwaStatusMessage.textContent = '离线资源已准备';
      document.body.dataset.pwaState = 'offlineReady';
      return;
    }
    elements.pwaStatus.hidden = true;
    elements.pwaStatus.dataset.state = installAvailable ? 'installAvailable' : '';
    document.body.dataset.pwaState = installAvailable ? 'installAvailable' : '';
  }

  function toast(message, duration = 2600) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    if (window.gsap) {
      window.gsap.fromTo(elements.toast, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    }
    toastTimer = window.setTimeout(() => {
      if (window.gsap) {
        window.gsap.to(elements.toast, { opacity: 0, y: -5, duration: 0.25, onComplete: () => { elements.toast.hidden = true; } });
      } else {
        elements.toast.hidden = true;
      }
    }, duration);
  }

  function toggleSettings(force) {
    settingsOpen = typeof force === 'boolean' ? force : !settingsOpen;
    elements.settings.hidden = !settingsOpen;
    elements.settingsButton.setAttribute('aria-expanded', String(settingsOpen));
  }

  function showError(error) {
    window.clearTimeout(loadingTimer);
    loadingTimer = 0;
    elements.loading.hidden = true;
    elements.intro.hidden = true;
    elements.app.hidden = true;
    elements.errorMessage.textContent = error?.message || '请更新浏览器，并确认硬件加速已开启。';
    elements.error.hidden = false;
    document.body.dataset.appState = 'error';
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      toast('浏览器拒绝了全屏请求');
    }
  }

  createBodyNavigation();

  listen(elements.start, 'click', () => callbacks.onStart?.());
  listen(elements.installApp, 'click', () => callbacks.onInstallApp?.());
  listen(elements.updateApp, 'click', () => callbacks.onUpdateApp?.());
  listen(elements.closeInfo, 'click', () => {
    hideInfo();
  });
  listen(elements.overview, 'click', () => callbacks.onOverview?.());
  listen(elements.play, 'click', () => callbacks.onTogglePlay?.());
  listen(elements.resetTime, 'click', () => callbacks.onResetTime?.());
  listen(elements.date, 'change', () => callbacks.onDateChange?.(elements.date.value));
  listen(elements.dateModeOptions, 'click', (event) => {
    const button = event.target.closest('[data-date-mode]');
    if (!button) return;
    callbacks.onDateMode?.(button.dataset.dateMode);
  });
  listen(elements.today, 'click', () => callbacks.onToday?.());
  listen(elements.settingsButton, 'click', () => toggleSettings());
  listen(elements.closeSettings, 'click', () => toggleSettings(false));
  listen(elements.fullscreen, 'click', toggleFullscreen);
  listen(elements.sound, 'click', async () => {
    if (elements.sound.disabled) return;
    elements.sound.disabled = true;
    try {
      const active = await callbacks.onToggleSound?.();
      setSoundEnabled(Boolean(active));
    } finally {
      elements.sound.disabled = false;
    }
  });
  listen(elements.cruise, 'click', () => {
    const next = !cruising;
    setCruising(next);
    callbacks.onCruise?.(next);
  });
  listen(elements.orbits, 'change', () => callbacks.onOrbits?.(elements.orbits.checked));
  listen(elements.asteroids, 'change', () => callbacks.onAsteroids?.(elements.asteroids.checked));
  listen(elements.labels, 'change', () => callbacks.onLabels?.(elements.labels.checked));
  listen(elements.diagnosticsToggle, 'change', () => callbacks.onDiagnostics?.(elements.diagnosticsToggle.checked));
  listen(elements.depthOfField, 'change', () => callbacks.onDepthOfField?.(elements.depthOfField.checked));
  listen(elements.speedOptions, 'click', (event) => {
    const button = event.target.closest('[data-speed]');
    if (!button) return;
    callbacks.onMultiplier?.(Number(button.dataset.speed));
  });
  listen(elements.scaleOptions, 'click', (event) => {
    const button = event.target.closest('[data-scale]');
    if (!button) return;
    callbacks.onScaleMode?.(button.dataset.scale);
  });
  listen(elements.qualityOptions, 'click', (event) => {
    const button = event.target.closest('[data-quality]');
    if (!button) return;
    callbacks.onQuality?.(button.dataset.quality);
  });
  listen(document, 'fullscreenchange', () => {
    elements.fullscreen.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
  });
  listen(window, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (settingsOpen) toggleSettings(false);
    else callbacks.onOverview?.();
  });

  function dispose() {
    listeners.splice(0).forEach((remove) => remove());
    window.clearTimeout(toastTimer);
    window.clearTimeout(loadingTimer);
    loadingTimer = 0;
    window.gsap?.killTweensOf(elements.toast);
  }

  return {
    setLoading,
    completeLoading,
    enableStart,
    enterApp,
    showBody,
    hideInfo,
    setHover,
    hideHover,
    setPlaying,
    setMultiplier,
    setDate,
    setDateMode,
    setScaleMode,
    setQuality,
    setDepthOfField,
    setDiagnosticsVisible,
    setDiagnostics,
    setCruising,
    setViewState,
    setSoundEnabled,
    setPwaState,
    toast,
    toggleSettings,
    showError,
    dispose,
  };
}
