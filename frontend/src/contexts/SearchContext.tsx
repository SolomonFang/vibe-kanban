import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';

const ITERATION_STORAGE_KEY = 'vibe-kanban:iteration';

function getStoredIteration(projectId: string): string | null {
  try {
    const raw = localStorage.getItem(`${ITERATION_STORAGE_KEY}:${projectId}`);
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

function setStoredIteration(projectId: string, value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(`${ITERATION_STORAGE_KEY}:${projectId}`, JSON.stringify(value));
    } else {
      localStorage.removeItem(`${ITERATION_STORAGE_KEY}:${projectId}`);
    }
  } catch {
    // ignore
  }
}

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  iteration: string | null;
  setIteration: (iteration: string | null) => void;
  active: boolean;
  clear: () => void;
  focusInput: () => void;
  registerInputRef: (ref: HTMLInputElement | null) => void;
}

const SearchContext = createContext<SearchState | null>(null);

interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  const [query, setQuery] = useState('');
  const [iteration, setIteration] = useState<string | null>(null);
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevProjectRef = useRef(projectId);

  // Check if we're on a tasks route
  const isTasksRoute = /^\/local-projects\/[^/]+\/tasks/.test(
    location.pathname
  );

  // Restore iteration from localStorage when project changes
  useEffect(() => {
    if (projectId && projectId !== prevProjectRef.current) {
      prevProjectRef.current = projectId;
      const stored = getStoredIteration(projectId);
      setIteration(stored);
    }
  }, [projectId]);

  // Persist iteration to localStorage on change
  const handleSetIteration = useCallback((value: string | null) => {
    setIteration(value);
    if (projectId) {
      setStoredIteration(projectId, value);
    }
  }, [projectId]);

  // Clear search and iteration when leaving tasks pages
  useEffect(() => {
    if (!isTasksRoute) {
      if (query !== '') setQuery('');
      if (iteration !== null) setIteration(null);
    }
  }, [isTasksRoute, query, iteration]);

  const clear = () => {
    setQuery('');
    setIteration(null);
    if (projectId) {
      setStoredIteration(projectId, null);
    }
  };

  const focusInput = () => {
    if (inputRef.current && isTasksRoute) {
      inputRef.current.focus();
    }
  };

  const registerInputRef = useCallback((ref: HTMLInputElement | null) => {
    inputRef.current = ref;
  }, []);

  const value: SearchState = {
    query,
    setQuery,
    iteration,
    setIteration: handleSetIteration,
    active: isTasksRoute,
    clear,
    focusInput,
    registerInputRef,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchState {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
