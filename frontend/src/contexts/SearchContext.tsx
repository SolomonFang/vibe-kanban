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

  // Check if we're on a tasks route
  const isTasksRoute = /^\/local-projects\/[^/]+\/tasks/.test(
    location.pathname
  );

  // Clear search and iteration when leaving tasks pages
  useEffect(() => {
    if (!isTasksRoute) {
      if (query !== '') setQuery('');
      if (iteration !== null) setIteration(null);
    }
  }, [isTasksRoute, query, iteration]);

  // Clear search and iteration when project changes
  useEffect(() => {
    setQuery('');
    setIteration(null);
  }, [projectId]);

  const clear = () => {
    setQuery('');
    setIteration(null);
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
    setIteration,
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
