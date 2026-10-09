import { useEffect, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { costStoreStatus } from '../../lib/storage/costStore.js';
import {
  dataChangedEventName,
  getAppCostStore
} from '../../services/dataManagementService.js';

/*
 * Shown above every page when the stored expenses cannot be used (damaged,
 * from a newer version, or storage blocked), so the problem is never
 * mistaken for "no expenses yet". It only reads storage. Recovery actions
 * live in Settings, under "Your data".
 */
const problemMessages = {
  [costStoreStatus.damaged]:
    'Your saved expenses cannot be read. They have not been changed or deleted, and saving is paused to protect them.',
  [costStoreStatus.unsupported]:
    'Your saved expenses were created by a newer version of Cost Manager Pro. They have not been changed, and saving is paused.',
  [costStoreStatus.unavailable]:
    'Your browser is not allowing this site to use storage, so expenses cannot be read or saved.'
};

function readProblem() {
  return problemMessages[getAppCostStore().inspect().status] ?? null;
}

function StorageStatusBanner({ activePageId, onNavigate }) {
  // Storage is re-read on every render, which happens whenever the user
  // changes page. The counter below only forces a re-render when data
  // changes in this tab (a recovery action) or in another tab.
  const [, setChangeCount] = useState(0);
  const problem = readProblem();

  useEffect(() => {
    function handleDataChange() {
      setChangeCount((count) => count + 1);
    }

    window.addEventListener('storage', handleDataChange);
    window.addEventListener(dataChangedEventName, handleDataChange);

    return () => {
      window.removeEventListener('storage', handleDataChange);
      window.removeEventListener(dataChangedEventName, handleDataChange);
    };
  }, []);

  if (!problem) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Alert
        action={
          activePageId === 'settings' ? null : (
            <Button
              color="inherit"
              onClick={() => onNavigate('settings')}
              size="small"
              sx={{ whiteSpace: 'nowrap' }}
            >
              Open Settings
            </Button>
          )
        }
        severity="error"
      >
        {problem}
      </Alert>
    </Box>
  );
}

export default StorageStatusBanner;
