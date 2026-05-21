import { ReactNode, useState } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/contexts/WorkspaceContext';
import { ActionsProvider } from '@/contexts/ActionsContext';
import { ApprovalsProvider } from '@/contexts/ApprovalsContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { LogsPanelProvider } from '@/contexts/LogsPanelContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/new/index.css';

interface VSCodeScopeProps {
  children: ReactNode;
}

// Wrapper component to get workspaceId from context for ExecutionProcessesProvider
function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { workspaceId, selectedSessionId } = useWorkspaceContext();
  return (
    <ExecutionProcessesProvider
      attemptId={workspaceId}
      sessionId={selectedSessionId}
    >
      {children}
    </ExecutionProcessesProvider>
  );
}

/**
 * VSCodeScope - Minimal provider stack for VS Code extension
 */
export function VSCodeScope({ children }: VSCodeScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div ref={setContainer} className="new-design h-full">
      <WorkspaceProvider>
        <ApprovalsProvider>
          <ExecutionProcessesProviderWrapper>
            <LogsPanelProvider>
              <ActionsProvider>
                {container ? (
                  <PortalContainerContext.Provider value={container}>
                    <NiceModal.Provider>{children}</NiceModal.Provider>
                  </PortalContainerContext.Provider>
                ) : null}
              </ActionsProvider>
            </LogsPanelProvider>
          </ExecutionProcessesProviderWrapper>
        </ApprovalsProvider>
      </WorkspaceProvider>
    </div>
  );
}
