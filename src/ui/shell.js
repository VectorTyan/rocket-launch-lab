import { createShellContext } from './context.js';
import { renderHeader } from './header.js';
import { renderSidebar } from './sidebar.js';
import { renderViewport } from './viewport.js';
import { renderConsoles } from './consoles.js';
import { renderAbout } from './about.js';

/** Render the existing app shell; event binding remains with app controllers. */
export function renderAppShell(options) {
  const context = createShellContext(options);
  return `
    ${renderHeader()}
    <main class="workspace">
      ${renderSidebar(context)}
      <section class="experience" aria-label="火箭三维体验">
        ${renderViewport(context)}
        ${renderConsoles(context)}
      </section>
    </main>
    ${renderAbout(context)}
  `;
}

export { icon } from './icons.js';
export { formatTime, coordinate } from './formatters.js';
export { CAMERA_MODES } from './config.js';
