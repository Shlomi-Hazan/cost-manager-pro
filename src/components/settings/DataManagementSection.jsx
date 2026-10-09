import { useEffect, useRef, useState } from 'react';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import SectionCard from '../common/SectionCard.jsx';
import { costStoreStatus } from '../../lib/storage/costStore.js';
import { legacyDataStatus } from '../../lib/storage/legacyStorage.js';
import {
  applyRestore,
  dataChangedEventName,
  downloadBackup,
  downloadPreviousData,
  downloadUnreadableData,
  getDataStatus,
  importLegacyCopy,
  notifyDataChanged,
  prepareRestore,
  resetUnreadableData,
  restorePreviousData
} from '../../services/dataManagementService.js';
import { getStorageErrorMessage } from '../../utils/storageErrorMessage.js';

/*
 * "Your data" in Settings (M1): backup, restore, and recovery for the
 * expenses stored in this browser. Every action that replaces data asks
 * for confirmation first and keeps the replaced data as "previous data",
 * which can be downloaded or restored from here.
 */

const previousDataReasonLabels = {
  restore: 'before a backup was restored',
  'legacy-import': 'before earlier data was imported',
  reset: 'before unreadable data was cleared',
  undo: 'before previous data was restored',
  'schema-migration': 'before the storage format was upgraded'
};

function formatDateTime(isoString) {
  const date = new Date(isoString);

  return Number.isNaN(date.getTime()) ? 'an unknown date' : date.toLocaleString();
}

function formatExpenseCount(count) {
  return count === 1 ? '1 expense' : `${count} expenses`;
}

function getActionErrorMessage(error, fallback) {
  return getStorageErrorMessage(error) ?? (error?.name === 'BackupError' ? error.message : fallback);
}

function DataManagementSection() {
  const [dataStatus, setDataStatus] = useState(getDataStatus);
  const [feedback, setFeedback] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const fileInputRef = useRef(null);

  const { status, costCount, previousData, legacy } = dataStatus;
  const isUsable = status === costStoreStatus.ready || status === costStoreStatus.empty;
  const isUnreadable = status === costStoreStatus.damaged || status === costStoreStatus.unsupported;
  const isUnavailable = status === costStoreStatus.unavailable;
  // Matches costStore's rule: replacing keeps the current data as previous
  // data unless the current dataset is empty.
  const replacementOverwritesPrevious = Boolean(previousData) && (isUnreadable || costCount > 0);

  function refreshStatus() {
    setDataStatus(getDataStatus());
  }

  // Keep the section accurate when another tab changes the data.
  useEffect(() => {
    function handleDataChange() {
      setDataStatus(getDataStatus());
    }

    window.addEventListener('storage', handleDataChange);
    window.addEventListener(dataChangedEventName, handleDataChange);

    return () => {
      window.removeEventListener('storage', handleDataChange);
      window.removeEventListener(dataChangedEventName, handleDataChange);
    };
  }, []);

  function runAction(action, successMessage, fallbackError) {
    try {
      const result = action();

      setFeedback({ severity: 'success', message: successMessage(result) });
    } catch (error) {
      setFeedback({ severity: 'error', message: getActionErrorMessage(error, fallbackError) });
    } finally {
      refreshStatus();
      notifyDataChanged();
    }
  }

  function handleDownloadBackup() {
    runAction(
      () => downloadBackup(),
      (file) => `Backup downloaded: ${file.filename} (${formatExpenseCount(file.costCount)}).`,
      'The backup could not be created. Please try again.'
    );
  }

  function handleChooseBackupFile() {
    setFeedback(null);
    fileInputRef.current?.click();
  }

  // Reads and fully validates the file. Nothing changes until the user
  // confirms in the dialog.
  async function handleBackupFileSelected(event) {
    const [file] = event.target.files ?? [];

    // Clearing the input lets the same file be chosen again later.
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const preparedRestore = prepareRestore(await file.text());

      setPendingAction({ type: 'restore', preparedRestore, fileName: file.name });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: getActionErrorMessage(error, 'This file could not be read. Nothing was restored.')
      });
    }
  }

  function handleConfirm() {
    const action = pendingAction;

    setPendingAction(null);

    if (action.type === 'restore') {
      runAction(
        () => applyRestore(action.preparedRestore),
        (count) => `Restored ${formatExpenseCount(count)} from the backup. Your earlier data was kept as previous data.`,
        'The backup could not be restored. Your data was not changed.'
      );
    } else if (action.type === 'legacy') {
      runAction(
        () => importLegacyCopy(),
        (count) => `Imported a copy of ${formatExpenseCount(count)}. The original data was left unchanged.`,
        'The earlier data could not be imported. Nothing was changed.'
      );
    } else if (action.type === 'reset') {
      runAction(
        () => resetUnreadableData(),
        () => 'Started with an empty expense list. The unreadable data was kept as previous data and can still be downloaded.',
        'The data could not be reset. Nothing was changed.'
      );
    } else if (action.type === 'undo') {
      runAction(
        () => restorePreviousData(),
        (count) => `Restored ${formatExpenseCount(count)} from previous data. The data it replaced is now the previous data.`,
        'The previous data could not be restored. Nothing was changed.'
      );
    }
  }

  function getDialogContent() {
    const keepNote = replacementOverwritesPrevious
      ? `The data stored now will be kept as previous data, replacing the previous data saved on ${formatDateTime(previousData.createdAt)}.`
      : 'The data stored now will be kept as previous data, so you can undo this from this page.';

    switch (pendingAction?.type) {
      case 'restore':
        return {
          title: 'Replace your expenses with this backup?',
          body: [
            `"${pendingAction.fileName}" was created on ${formatDateTime(pendingAction.preparedRestore.exportedAt)} and contains ${formatExpenseCount(pendingAction.preparedRestore.costCount)}.`,
            isUnreadable
              ? 'It will replace the unreadable data stored in this browser.'
              : `It will replace the ${formatExpenseCount(costCount)} stored in this browser. Expenses that are not in the backup will no longer appear.`,
            keepNote
          ],
          confirmLabel: 'Replace with backup'
        };
      case 'legacy':
        return {
          title: 'Import data from an earlier version?',
          body: [
            `A copy of ${formatExpenseCount(legacy.costs.length)} will be added to Cost Manager Pro.`,
            'The original data stays where it is and is not changed.'
          ],
          confirmLabel: 'Import a copy'
        };
      case 'reset':
        return {
          title: 'Start with an empty expense list?',
          body: [
            'The unreadable data will be moved to previous data, where you can still download it. Your expense list will then be empty.',
            replacementOverwritesPrevious
              ? `This replaces the previous data saved on ${formatDateTime(previousData.createdAt)}. Download it first if you need it.`
              : 'Download the unreadable data first if you want to keep a separate copy.'
          ],
          confirmLabel: 'Start empty'
        };
      case 'undo':
        return {
          title: 'Restore previous data?',
          body: [
            `The previous data (${formatExpenseCount(previousData.costCount)}) will replace what is stored now.`,
            'What is stored now becomes the previous data, so you can switch back.'
          ],
          confirmLabel: 'Restore previous data'
        };
      default:
        return null;
    }
  }

  const dialogContent = getDialogContent();

  return (
    <SectionCard aria-labelledby="your-data-heading">
      <Stack spacing={3}>
        <Box>
          <Typography component="h2" id="your-data-heading" variant="h2">
            Your data
          </Typography>
          <Typography color="text.secondary" variant="body1">
            Your expenses are stored only in this browser on this device. Clearing
            your browser data deletes them, so download a backup regularly.
          </Typography>
        </Box>

        {feedback ? (
          <Alert onClose={() => setFeedback(null)} severity={feedback.severity}>
            {feedback.message}
          </Alert>
        ) : null}

        {/* Current state: usable, unreadable, or storage blocked. */}
        {isUsable ? (
          <Typography>
            {costCount === 0
              ? 'No expenses are stored in this browser yet.'
              : `${formatExpenseCount(costCount)} stored in this browser.`}
          </Typography>
        ) : null}

        {isUnreadable ? (
          <Alert severity="error">
            {status === costStoreStatus.unsupported
              ? 'Your saved expenses were created by a newer version of Cost Manager Pro and cannot be used here.'
              : 'Your saved expenses cannot be read.'}{' '}
            Nothing has been changed or deleted, and saving is paused to protect
            them. Download the stored data to keep a copy, then restore a backup
            or start with an empty list.
          </Alert>
        ) : null}

        {isUnavailable ? (
          <Alert severity="error">
            Your browser is not allowing this site to use storage, so backup and
            restore are not available. Check the site data settings in your browser.
          </Alert>
        ) : null}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {isUsable ? (
            <Button
              disabled={costCount === 0}
              onClick={handleDownloadBackup}
              startIcon={<DownloadOutlinedIcon aria-hidden="true" />}
              variant="contained"
            >
              Download backup
            </Button>
          ) : null}
          {isUnreadable && dataStatus.hasRawData ? (
            <Button
              onClick={() =>
                runAction(
                  () => downloadUnreadableData(),
                  () => 'The stored data was downloaded exactly as it is.',
                  'The stored data could not be downloaded.'
                )
              }
              startIcon={<DownloadOutlinedIcon aria-hidden="true" />}
              variant="contained"
            >
              Download stored data
            </Button>
          ) : null}
          {!isUnavailable ? (
            <Button
              onClick={handleChooseBackupFile}
              startIcon={<UploadFileOutlinedIcon aria-hidden="true" />}
              variant="outlined"
            >
              Restore from backup…
            </Button>
          ) : null}
          {isUnreadable ? (
            <Button color="error" onClick={() => setPendingAction({ type: 'reset' })} variant="outlined">
              Start with an empty list…
            </Button>
          ) : null}
        </Box>

        <input
          accept="application/json,.json"
          aria-label="Backup file to restore"
          hidden
          onChange={handleBackupFileSelected}
          ref={fileInputRef}
          type="file"
        />

        {/* Data saved by the app before M1, offered only while empty. */}
        {legacy.status === legacyDataStatus.available ? (
          <Alert
            action={
              <Button
                color="inherit"
                onClick={() => setPendingAction({ type: 'legacy' })}
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
              >
                Import a copy…
              </Button>
            }
            severity="info"
          >
            This browser has {formatExpenseCount(legacy.costs.length)} saved by an
            earlier version of Cost Manager. You can import a copy; the original
            data is not changed.
          </Alert>
        ) : null}

        {/* The single "previous data" safety copy. */}
        {previousData ? (
          <Box>
            <Typography component="h3" variant="h3">
              Previous data
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Saved on {formatDateTime(previousData.createdAt)}
              {previousDataReasonLabels[previousData.reason]
                ? `, ${previousDataReasonLabels[previousData.reason]}`
                : ''}
              {previousData.isRestorable
                ? ` (${formatExpenseCount(previousData.costCount)}).`
                : '. It cannot be read, but it can be downloaded exactly as it was stored.'}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Button
                onClick={() =>
                  runAction(
                    () => downloadPreviousData(),
                    () => 'Previous data downloaded.',
                    'The previous data could not be downloaded.'
                  )
                }
                startIcon={<DownloadOutlinedIcon aria-hidden="true" />}
                variant="outlined"
              >
                Download previous data
              </Button>
              {previousData.isRestorable && !isUnavailable ? (
                <Button
                  onClick={() => setPendingAction({ type: 'undo' })}
                  startIcon={<HistoryOutlinedIcon aria-hidden="true" />}
                  variant="outlined"
                >
                  Restore previous data…
                </Button>
              ) : null}
            </Box>
          </Box>
        ) : null}
      </Stack>

      <Dialog
        aria-describedby="data-confirmation-description"
        aria-labelledby="data-confirmation-title"
        onClose={() => setPendingAction(null)}
        open={Boolean(dialogContent)}
      >
        {dialogContent ? (
          <>
            <DialogTitle id="data-confirmation-title">{dialogContent.title}</DialogTitle>
            <DialogContent id="data-confirmation-description">
              <Stack spacing={1.5}>
                {dialogContent.body.map((paragraph) => (
                  <DialogContentText key={paragraph}>{paragraph}</DialogContentText>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPendingAction(null)}>Cancel</Button>
              <Button color="warning" onClick={handleConfirm} variant="contained">
                {dialogContent.confirmLabel}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </SectionCard>
  );
}

export default DataManagementSection;
