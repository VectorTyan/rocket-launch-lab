import './style.css';
import { createApplication } from './app/create-application.js';

const application = createApplication({ root: document.querySelector('#app') });

if (import.meta.hot) {
  import.meta.hot.dispose(() => application.dispose());
}
