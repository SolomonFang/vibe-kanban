import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import NewDisplayConversationEntry from './NewDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { useEntries } from '@/contexts/EntriesContext';
import {
  useResetProcess,
  type UseResetProcessResult,
} from '@/components/ui-new/hooks/useResetProcess';
import {
  AddEntryType,
  PatchTypeWithKey,
  DisplayEntry,
  isAggregatedGroup,
  isAggregatedDiffGroup,
  isAggregatedThinkingGroup,
  useConversationHistory,
} from '@/components/ui-new/hooks/useConversationHistory';
import { aggregateConsecutiveEntries } from '@/utils/aggregateEntries';
import { extractTokenUsageFromEntries } from '@/utils/streamJsonPatchEntries';
import type { TokenUsageInfo } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import type { RepoWithTargetBranch } from 'shared/types';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ChatScriptPlaceholder } from '../primitives/conversation/ChatScriptPlaceholder';
import { ScriptFixerDialog } from '@/components/dialogs/scripts/ScriptFixerDialog';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
}

export interface ConversationListHandle {
  scrollToPreviousUserMessage: () => void;
  scrollToBottom: () => void;
}

interface MessageListContext {
  attempt: WorkspaceWithSession;
  onConfigureSetup: (() => void) | undefined;
  onConfigureCleanup: (() => void) | undefined;
  showSetupPlaceholder: boolean;
  showCleanupPlaceholder: boolean;
  resetAction: UseResetProcessResult;
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

/** Entries that NewDisplayConversationEntry intentionally does not render. */
function filterRenderableEntries(
  entries: PatchTypeWithKey[]
): PatchTypeWithKey[] {
  return entries.filter((entry) => {
    if (entry.type !== 'NORMALIZED_ENTRY') return true;
    const entryType = entry.content.entry_type.type;
    return entryType !== 'next_action' && entryType !== 'token_usage_info';
  });
}

const ScrollToTopOfLastItem: ScrollModifier = {
  type: 'item-location',
  location: {
    index: 'LAST',
    align: 'start',
  },
};

const ItemContent: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  const attempt = context?.attempt;
  const resetAction = context?.resetAction;

  // Handle aggregated tool groups (file_read, search, web_fetch)
  if (isAggregatedGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={data}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  // Handle aggregated diff groups (file_edit by same path)
  if (isAggregatedDiffGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={data}
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  // Handle aggregated thinking groups (thinking entries in previous turns)
  if (isAggregatedThinkingGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={data}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['computeItemKey'] = ({ data }) => `conv-${data.patchKey}`;

export const ConversationList = forwardRef<
  ConversationListHandle,
  ConversationListProps
>(function ConversationList({ attempt }, ref) {
  const resetAction = useResetProcess();
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<DisplayEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset, setTokenUsageInfo } = useEntries();
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
    tokenUsage?: TokenUsageInfo | null;
  } | null>(null);
  // rAF throttle: 100ms debounce never fires during continuous streaming because
  // each WS patch resets the timer (~16ms with upstream-style rAF batching).
  const rafIdRef = useRef<number | null>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const applyPendingUpdate = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingUpdateRef.current;
    if (!pending) return;

    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if (pending.addType === 'plan' && !loadingRef.current) {
      scrollModifier = ScrollToTopOfLastItem;
    } else if (pending.addType === 'running' && !loadingRef.current) {
      scrollModifier = AutoScrollToBottom;
    }

    const renderableEntries = filterRenderableEntries(pending.entries);
    const aggregatedEntries = aggregateConsecutiveEntries(renderableEntries);

    setChannelData({ data: aggregatedEntries, scrollModifier });
    setEntries(renderableEntries);

    const tokenUsage =
      pending.tokenUsage ?? extractTokenUsageFromEntries(pending.entries);
    if (tokenUsage) {
      setTokenUsageInfo(tokenUsage);
    }

    setLoading(pending.loading);
  }, [setEntries, setTokenUsageInfo]);

  // Get repos from workspace context to check if scripts are configured
  let repos: RepoWithTargetBranch[] = [];
  try {
    const workspaceContext = useWorkspaceContext();
    repos = workspaceContext.repos;
  } catch {
    // Context not available
  }

  // Use ref to access current repos without causing callback recreation
  const reposRef = useRef(repos);
  reposRef.current = repos;

  // Check if any repo has setup or cleanup scripts configured
  const hasSetupScript = repos.some((repo) => repo.setup_script);
  const hasCleanupScript = repos.some((repo) => repo.cleanup_script);

  // Handlers to open script fixer dialog for setup/cleanup scripts
  const handleConfigureSetup = useCallback(() => {
    const currentRepos = reposRef.current;
    if (currentRepos.length === 0) return;

    ScriptFixerDialog.show({
      scriptType: 'setup',
      repos: currentRepos,
      workspaceId: attempt.id,
      sessionId: attempt.session?.id,
    });
  }, [attempt.id, attempt.session?.id]);

  const handleConfigureCleanup = useCallback(() => {
    const currentRepos = reposRef.current;
    if (currentRepos.length === 0) return;

    ScriptFixerDialog.show({
      scriptType: 'cleanup',
      repos: currentRepos,
      workspaceId: attempt.id,
      sessionId: attempt.session?.id,
    });
  }, [attempt.id, attempt.session?.id]);

  // Determine if configure buttons should be shown
  const canConfigure = repos.length > 0;

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
      pendingUpdateRef.current = {
        entries: newEntries,
        addType,
        loading: newLoading,
        tokenUsage,
      };

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(applyPendingUpdate);
      }
    },
    [applyPendingUpdate]
  );

  const { hasSetupScriptRun, hasCleanupScriptRun, hasRunningProcess } =
    useConversationHistory({ attempt, onEntriesUpdated });

  // Determine if there are entries to show placeholders
  const entries = channelData?.data ?? [];
  const hasEntries = entries.length > 0;

  // Show placeholders only if script not configured AND not already run
  const showSetupPlaceholder =
    !hasSetupScript && !hasSetupScriptRun && hasEntries;
  const showCleanupPlaceholder =
    !hasCleanupScript &&
    !hasCleanupScriptRun &&
    !hasRunningProcess &&
    hasEntries;

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({
      attempt,
      onConfigureSetup: canConfigure ? handleConfigureSetup : undefined,
      onConfigureCleanup: canConfigure ? handleConfigureCleanup : undefined,
      showSetupPlaceholder,
      showCleanupPlaceholder,
      resetAction,
    }),
    [
      attempt,
      canConfigure,
      handleConfigureSetup,
      handleConfigureCleanup,
      showSetupPlaceholder,
      showCleanupPlaceholder,
      resetAction,
    ]
  );

  // Expose scroll to previous user message functionality via ref
  useImperativeHandle(
    ref,
    () => ({
      scrollToPreviousUserMessage: () => {
        const data = channelData?.data;
        if (!data || !messageListRef.current) return;

        // Get currently rendered items to find visible range
        const rendered = messageListRef.current.data.getCurrentlyRendered();
        if (!rendered.length) return;

        // Find the index of the first visible item in the full data array
        const firstVisibleKey = rendered[0]?.patchKey;
        const firstVisibleIndex = data.findIndex(
          (item) => item.patchKey === firstVisibleKey
        );

        // Find all user message indices
        const userMessageIndices: number[] = [];
        data.forEach((item, index) => {
          if (
            item.type === 'NORMALIZED_ENTRY' &&
            item.content.entry_type.type === 'user_message'
          ) {
            userMessageIndices.push(index);
          }
        });

        // Find the user message before the first visible item
        const targetIndex = userMessageIndices
          .reverse()
          .find((idx) => idx < firstVisibleIndex);

        if (targetIndex !== undefined) {
          messageListRef.current.scrollToItem({
            index: targetIndex,
            align: 'start',
            behavior: 'smooth',
          });
        }
      },
      scrollToBottom: () => {
        if (!messageListRef.current) return;
        messageListRef.current.scrollToItem({
          index: 'LAST',
          align: 'end',
          behavior: 'smooth',
        });
      },
    }),
    [channelData]
  );

  const showEmptyState =
    !loading && (channelData?.data?.length ?? 0) === 0;

  return (
    <ApprovalFormProvider>
      <div className="h-full">
        {showEmptyState ? (
          <div className="h-full flex items-center justify-center px-double">
            <p className="text-sm text-low text-center">
              No messages yet. Send a prompt to start the conversation.
            </p>
          </div>
        ) : (
        <VirtuosoMessageListLicense
          licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
        >
          <VirtuosoMessageList<DisplayEntry, MessageListContext>
            ref={messageListRef}
            className="h-full scrollbar-none"
            data={channelData}
            initialLocation={INITIAL_TOP_ITEM}
            context={messageListContext}
            computeItemKey={computeItemKey}
            ItemContent={ItemContent}
            Header={({ context }) => (
              <div className="pt-2">
                {context?.showSetupPlaceholder && (
                  <div className="my-base px-double">
                    <ChatScriptPlaceholder
                      type="setup"
                      onConfigure={context.onConfigureSetup}
                    />
                  </div>
                )}
              </div>
            )}
            Footer={({ context }) => (
              <div className="pb-2">
                {context?.showCleanupPlaceholder && (
                  <div className="my-base px-double">
                    <ChatScriptPlaceholder
                      type="cleanup"
                      onConfigure={context.onConfigureCleanup}
                    />
                  </div>
                )}
              </div>
            )}
          />
        </VirtuosoMessageListLicense>
        )}
      </div>
    </ApprovalFormProvider>
  );
});

export default ConversationList;
