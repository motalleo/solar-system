const INITIAL_STATE = Object.freeze({
  installAvailable: false,
  offlineReady: false,
  updateAvailable: false,
});

export function createPwaLifecycle({
  windowObject = globalThis.window,
  navigatorObject = globalThis.navigator,
  locationObject = globalThis.location,
  serviceWorkerUrl = new URL('../../sw.js', import.meta.url),
  scopeUrl = new URL('../../', import.meta.url),
  onStateChange = () => {},
  onToast = () => {},
  onWarning = () => {},
} = {}) {
  const state = { ...INITIAL_STATE };
  const serviceWorker = navigatorObject?.serviceWorker;
  let disposed = false;
  let started = false;
  let startPromise = null;
  let registration = null;
  let observedWorker = null;
  let pendingWorker = null;
  let deferredInstallPrompt = null;
  let updateTransactionPending = false;
  let reloadApproved = false;

  function setState(patch) {
    if (disposed) return;
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (state[key] === value) continue;
      state[key] = value;
      changed = true;
    }
    if (changed) onStateChange({ ...state });
  }

  function exposeUpdate(worker) {
    if (disposed || !worker || worker.state !== 'installed') return;
    pendingWorker = worker;
    setState({ updateAvailable: true });
  }

  function resetUpdateTransaction() {
    updateTransactionPending = false;
    reloadApproved = false;
  }

  function handleBeforeInstallPrompt(event) {
    if (disposed) return;
    event.preventDefault();
    deferredInstallPrompt = event;
    setState({ installAvailable: true });
  }

  function handleAppInstalled() {
    if (disposed) return;
    deferredInstallPrompt = null;
    setState({ installAvailable: false });
    onToast('太阳系离线星历已安装', 2200);
  }

  function handleServiceWorkerMessage(event) {
    if (disposed || event.data?.type !== 'OFFLINE_READY') return;
    setState({ offlineReady: true });
    onToast('离线资源已准备', 2200);
  }

  function handleControllerChange() {
    if (disposed) return;
    setState({ offlineReady: true });
    if (!reloadApproved || !updateTransactionPending) return;
    resetUpdateTransaction();
    pendingWorker = null;
    windowObject.location.reload();
  }

  function handleWorkerStateChange() {
    if (disposed || !observedWorker) return;
    if (observedWorker.state === 'installed' && serviceWorker?.controller) {
      exposeUpdate(observedWorker);
      return;
    }
    if (observedWorker.state === 'redundant') {
      if (pendingWorker === observedWorker) pendingWorker = null;
      resetUpdateTransaction();
      setState({ updateAvailable: false });
    }
  }

  function observeWorker(worker) {
    if (observedWorker === worker) return;
    if (observedWorker) observedWorker.removeEventListener('statechange', handleWorkerStateChange);
    observedWorker = worker || null;
    if (observedWorker) observedWorker.addEventListener('statechange', handleWorkerStateChange);
  }

  function handleUpdateFound() {
    if (disposed) return;
    observeWorker(registration?.installing || null);
  }

  function attachGlobalListeners() {
    windowObject.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    windowObject.addEventListener('appinstalled', handleAppInstalled);
    serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    serviceWorker?.addEventListener('controllerchange', handleControllerChange);
  }

  function detachGlobalListeners() {
    windowObject.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    windowObject.removeEventListener('appinstalled', handleAppInstalled);
    serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
  }

  async function startRegistration() {
    const isLocalhost = locationObject.hostname === 'localhost'
      || locationObject.hostname === '127.0.0.1'
      || locationObject.hostname === '[::1]';
    const isSecure = locationObject.protocol === 'https:' || isLocalhost;
    if (!isSecure || !serviceWorker) return null;

    try {
      const nextRegistration = await serviceWorker.register(serviceWorkerUrl, {
        scope: scopeUrl.pathname,
      });
      if (disposed) return null;
      registration = nextRegistration;
      registration.addEventListener('updatefound', handleUpdateFound);
      observeWorker(registration.installing || null);
      if (registration.active) setState({ offlineReady: true });
      if (registration.waiting && serviceWorker.controller) exposeUpdate(registration.waiting);
      return registration;
    } catch (error) {
      if (disposed) return null;
      onToast('离线模式暂不可用，在线探索不受影响', 2600);
      onWarning('Service Worker 注册失败', error);
      return null;
    }
  }

  function start() {
    if (disposed) return Promise.resolve(null);
    if (started) return startPromise;
    started = true;
    attachGlobalListeners();
    startPromise = startRegistration();
    return startPromise;
  }

  async function requestInstall() {
    const promptEvent = deferredInstallPrompt;
    if (disposed || !promptEvent) return false;
    deferredInstallPrompt = null;
    setState({ installAvailable: false });
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome !== 'accepted') onToast('已取消安装，可稍后再试', 1800);
      return choice?.outcome === 'accepted';
    } catch (error) {
      if (!disposed) {
        onToast('安装未能启动，可稍后再试', 2200);
        onWarning('PWA 安装提示失败', error);
      }
      return false;
    }
  }

  function requestUpdate() {
    if (disposed || updateTransactionPending) return false;
    const worker = registration?.waiting;
    if (!worker || worker !== pendingWorker || worker.state !== 'installed') {
      pendingWorker = null;
      setState({ updateAvailable: false });
      return false;
    }

    updateTransactionPending = true;
    reloadApproved = false;
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
      reloadApproved = true;
      setState({ updateAvailable: false });
      onToast('正在更新，完成后将重新载入', 2400);
      return true;
    } catch (error) {
      resetUpdateTransaction();
      const stillWaiting = registration.waiting === worker && worker.state === 'installed';
      pendingWorker = stillWaiting ? worker : null;
      setState({ updateAvailable: stillWaiting });
      onToast('更新失败，请稍后重试', 2400);
      onWarning('Service Worker 更新消息发送失败', error);
      return false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    detachGlobalListeners();
    registration?.removeEventListener('updatefound', handleUpdateFound);
    observeWorker(null);
    registration = null;
    pendingWorker = null;
    deferredInstallPrompt = null;
    resetUpdateTransaction();
  }

  return {
    start,
    requestInstall,
    requestUpdate,
    getState: () => ({ ...state }),
    dispose,
  };
}
