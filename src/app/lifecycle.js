/** Every mounted feature owns a scope. Disposing it removes listeners and timers. */
export function createScope(timers = globalThis) {
  const cleanup = new Set();
  let disposed = false;
  function own(disposer) {
    if (disposed) {
      disposer();
      return () => {};
    }
    cleanup.add(disposer);
    return () => cleanup.delete(disposer);
  }
  function on(target, event, listener, options) {
    if (disposed) return;
    target.addEventListener(event, listener, options);
    own(() => target.removeEventListener(event, listener, options));
  }
  function later(callback, delay) {
    if (disposed) return () => {};
    let finished = false;
    const cancel = () => {
      if (finished) return;
      finished = true;
      timers.clearTimeout(id);
      cleanup.delete(cancel);
    };
    const id = timers.setTimeout(() => {
      cancel();
      if (!disposed) callback();
    }, delay);
    own(cancel);
    return cancel;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const errors = [];
    for (const release of [...cleanup].reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    cleanup.clear();
    if (errors.length) throw new AggregateError(errors, 'Some application resources could not be released.');
  }
  return {
    on,
    own,
    later,
    dispose,
    get disposed() {
      return disposed;
    },
  };
}

/** Scoped queries keep separately mounted apps and test fixtures independent. */
export function createDom(root) {
  return {
    root,
    document: root.ownerDocument,
    one: (selector) => root.querySelector(selector),
    all: (selector) => [...root.querySelectorAll(selector)],
  };
}

export function setPressed(elements, selected) {
  for (const element of elements) {
    const active = selected(element);
    element.classList.toggle('active', active);
    element.setAttribute('aria-pressed', String(active));
  }
}
