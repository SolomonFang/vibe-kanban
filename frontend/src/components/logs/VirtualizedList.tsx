import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus, type TokenUsageInfo } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

interface MessageListContext {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: INITIAL_TOP_ITEM,
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: 'smooth',
};

const ItemContent: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  const attempt = context?.attempt;
  const task = context?.task;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        task={task}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['computeItemKey'] = ({ data }) => `l-${data.patchKey}`;

/** Entries that DisplayConversationEntry does not render (null rows). */
function filterRenderableEntries(
  entries: PatchTypeWithKey[]
): PatchTypeWithKey[] {
  return entries.filter((entry) => {
    if (entry == null) return false;
    if (entry.type !== 'NORMALIZED_ENTRY') return true;
    return entry.content.entry_type.type !== 'token_usage_info';
  });
}

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<PatchTypeWithKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset, setTokenUsageInfo } = useEntries();
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
  } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const applyPendingUpdate = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingUpdateRef.current;
    if (!pending) return;

    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if (
      (pending.addType === 'running' || pending.addType === 'plan') &&
      !loadingRef.current
    ) {
      scrollModifier = AutoScrollToBottom;
    }

    const renderableEntries = filterRenderableEntries(pending.entries);
    setChannelData({ data: renderableEntries, scrollModifier });
    setEntries(renderableEntries);
    setLoading(pending.loading);
  }, [setEntries]);

  useEffect(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingUpdateRef.current = null;
    setLoading(true);
    setChannelData(null);
    reset();
  }, [attempt.id, reset]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const onEntriesUpdated = useCallback(
    (
      newEntries: PatchTypeWithKey[],
      addType: AddEntryType,
      newLoading: boolean,
      tokenUsage?: TokenUsageInfo | null
    ) => {
      if (tokenUsage) {
        setTokenUsageInfo(tokenUsage);
      }

      pendingUpdateRef.current = {
        entries: newEntries,
        addType,
        loading: newLoading,
      };

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(applyPendingUpdate);
      }
    },
    [applyPendingUpdate, setTokenUsageInfo]
  );

  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  return (
    <ApprovalFormProvider>
      <div className="relative flex flex-1 min-h-0 flex-col">
        <VirtuosoMessageListLicense
          licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
        >
          <VirtuosoMessageList<PatchTypeWithKey, MessageListContext>
            ref={messageListRef}
            className="flex-1 min-h-0"
            data={channelData}
            initialLocation={INITIAL_TOP_ITEM}
            context={messageListContext}
            computeItemKey={computeItemKey}
            ItemContent={ItemContent}
            Header={() => <div className="h-2"></div>}
            Footer={() => <div className="h-2"></div>}
          />
        </VirtuosoMessageListLicense>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading History</p>
          </div>
        )}
      </div>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
