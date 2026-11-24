import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/sora';
import '@fontsource-variable/figtree';
import '@fontsource-variable/noto-sans-arabic';
import { initI18n } from './i18n';
import { App } from './App';
import './styles/base.css';
import './styles/components.css';
import './styles/app.css';
import './styles/auth.css';
import './styles/settings.css';
import './styles/responsive.css';

async function bootstrap() {
  await initI18n();
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element missing');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
