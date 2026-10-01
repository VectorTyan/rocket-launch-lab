/** Preserve the existing karman.* storage format; denied storage stays usable in memory. */
export function createPreferences(storage) {
  const memory = new Map();
  let persistent = Boolean(storage);
  function get(key, fallback = null) {
    if (memory.has(key)) return memory.get(key);
    try {
      return storage?.getItem(`karman.${key}`) ?? fallback;
    } catch {
      persistent = false;
      return fallback;
    }
  }
  function set(key, value) {
    const text = String(value);
    memory.set(key, text);
    try {
      if (!storage) return (persistent = false);
      storage.setItem(`karman.${key}`, text);
      return (persistent = true);
    } catch {
      return (persistent = false);
    }
  }
  function object(key) {
    try {
      const value = JSON.parse(get(key, '{}'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  return {
    get,
    set,
    object,
    get persistent() {
      return persistent;
    },
  };
}

export function browserStorage(window) {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
