import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { GraphServicesProvider } from '@/graph/GraphServicesProvider';
import App from '@/App';
import './styles/globals.css';

// Aplica el tema guardado antes del primer render para evitar flash
const savedTheme = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem('prisma-theme') ?? '{}')?.state?.theme;
    return parsed === 'dark' || parsed === 'light' ? parsed : 'light';
  } catch {
    return 'light';
  }
})();
document.documentElement.setAttribute('data-theme', savedTheme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  0,
      retry:      1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('[main] No se encontró #root en el HTML');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GraphServicesProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </GraphServicesProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);