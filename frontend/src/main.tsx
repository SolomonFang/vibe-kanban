import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// CSS is now imported by design scope components (LegacyDesignScope, NewDesignScope)
import { ClickToComponent } from 'click-to-react-component';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
} from '@tanstack/react-query';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
// Import modal type definitions
import './types/modals';

if (
  import.meta.env.VITE_POSTHOG_API_KEY &&
  import.meta.env.VITE_POSTHOG_API_ENDPOINT
) {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_API_ENDPOINT,
    capture_pageview: false,
    capture_pageleave: true,
    capture_performance: true,
    autocapture: false,
    opt_out_capturing_by_default: true,
  });
} else {
  console.warn(
    'PostHog API key or endpoint not set. Analytics will be disabled.'
  );
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error('[React Query Error]', {
        queryKey: query.queryKey,
        error: error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <ClickToComponent />
        <App />
        {/*<TanStackDevtools plugins={[FormDevtoolsPlugin()]} />*/}
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
