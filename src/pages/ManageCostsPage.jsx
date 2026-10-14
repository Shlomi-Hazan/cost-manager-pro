import { useCallback, useEffect, useState } from 'react';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import CostTableRow from '../components/costs/CostTableRow.jsx';
import CostsPagination from '../components/costs/CostsPagination.jsx';
import EditCostDialog from '../components/costs/EditCostDialog.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import { costsDatabase } from '../lib/costsDatabase.js';
import { formatDateForDisplay, formatTime } from '../utils/dateTime.js';
import { formatStoredAmount } from '../lib/money/format.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

// M3.1A: only this many rows are in the page at once (all expenses stay
// reachable through the page controls). 50 rows is about 900 DOM nodes.
export const costsPageSize = 25;

/*
 * TEAM EXTENSION (X-002/X-003): lets the user view, edit, and delete
 * existing costs, none of which the official specification requires — it
 * only requires that costs can be added. This screen relies entirely on
 * db.js's id-based getAllCosts/updateCost/deleteCost extensions (see
 * src/lib/db.js); it never touches localStorage directly, and never edits
 * the auto-generated id.
 */

// Reads the list without letting a storage problem crash the page. An
// unreadable dataset is reported as an error, never shown as "no costs".
function loadCostList() {
  try {
    return { costs: costsDatabase.getAllCosts(), errorMessage: '' };
  } catch (error) {
    return {
      costs: [],
      errorMessage:
        getStorageErrorMessage(error) ?? 'Your expenses could not be loaded. Please reload the page.'
    };
  }
}

function ManageCostsPage() {
  // Saved-costs list, a page-level feedback banner, and separate
  // edit/delete dialog state (each dialog has its own draft values,
  // errors, and feedback so the two flows never interfere with each other).
  const [costList, setCostList] = useState(loadCostList);
  const { costs, errorMessage: loadErrorMessage } = costList;
  const [feedback, setFeedback] = useState(null);
  // Only the id-level "which row" is page state. The edit FORM state lives in
  // EditCostDialog, so typing never re-renders the table.
  const [editCost, setEditCost] = useState(null);
  const [deleteCost, setDeleteCost] = useState(null);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [page, setPage] = useState(0);

  // Re-reads the full list from db.js after any add/edit/delete elsewhere.
  function loadCosts() {
    setCostList(loadCostList());
  }

  // Another tab may add, edit, delete, or restore data. The browser fires a
  // "storage" event in this tab when that happens, so the list stays current.
  useEffect(() => {
    function handleStorageChange(event) {
      if (event.key === null || event.key.startsWith('cost-manager-pro:')) {
        setCostList(loadCostList());
      }
    }

    window.addEventListener('storage', handleStorageChange);

    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Stable identities (useCallback with no dependencies) so memoized rows do
  // not re-render when the page does.
  const handleOpenEdit = useCallback((cost) => {
    setEditCost(cost);
    setFeedback(null);
  }, []);

  const handleCloseEdit = useCallback(() => setEditCost(null), []);

  // The dialog saved (or found the row gone): refresh the list, say what happened.
  function handleEditSaved(outcome) {
    loadCosts();
    setEditCost(null);
    setFeedback(
      outcome === 'missing'
        ? { severity: 'warning', message: 'This cost no longer exists. The list has been refreshed.' }
        : { severity: 'success', message: 'Cost updated successfully.' }
    );
  }

  // Delete flow: opening the dialog only stages the target cost; deleteCost()
  // itself only runs once the user confirms below.
  const handleOpenDelete = useCallback((cost) => {
    setDeleteCost(cost);
    setDeleteFeedback('');
    setFeedback(null);
  }, []);

  function handleCloseDelete() {
    setDeleteCost(null);
    setDeleteFeedback('');
  }

  // Runs only after the user confirms in the delete dialog.
  function handleConfirmDelete() {
    setDeleteFeedback('');

    try {
      const deletedCost = costsDatabase.deleteCost(deleteCost.id);

      loadCosts();
      handleCloseDelete();

      // A null result means the id no longer exists (e.g. deleted from
      // another tab) — not an error, just a stale row to refresh away.
      if (deletedCost === null) {
        setFeedback({
          severity: 'warning',
          message: 'This cost no longer exists. The list has been refreshed.'
        });
        return;
      }

      setFeedback({
        severity: 'success',
        message: 'Cost deleted successfully.'
      });
    } catch (error) {
      setDeleteFeedback(
        getStorageErrorMessage(error) ?? 'Could not delete cost. Please try again.'
      );
    }
  }

  // The page index is clamped, so deleting the last row of the last page (or
  // another tab shrinking the list) lands on the new last page, never on an
  // empty one.
  const pageCount = Math.max(1, Math.ceil(costs.length / costsPageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleCosts = costs.slice(currentPage * costsPageSize, (currentPage + 1) * costsPageSize);

  return (
    <Stack spacing={3}>
      <PageHeader title="Manage Costs">
        Review, edit, or delete your saved expenses.
      </PageHeader>

      {feedback ? <Alert severity={feedback.severity}>{feedback.message}</Alert> : null}

      {/* Load error vs. empty state vs. the saved-costs table below. */}
      {loadErrorMessage ? (
        <Alert severity="error">{loadErrorMessage}</Alert>
      ) : costs.length === 0 ? (
        <Alert icon={<InboxOutlinedIcon aria-hidden="true" />} severity="info">
          No costs have been added yet. Add costs from the Add Cost section.
        </Alert>
      ) : (
        <SectionCard sx={{ p: 0 }}>
          <TableContainer>
            <Table aria-label="Saved costs">
              {/* Column order matches each data row rendered below. */}
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Sum</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              {/* Only the current page of costs, in stored order. */}
              <TableBody>
                {visibleCosts.map((cost) => (
                  <CostTableRow cost={cost} key={cost.id} onDelete={handleOpenDelete} onEdit={handleOpenEdit} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {pageCount > 1 ? (
            <CostsPagination onPageChange={setPage} page={currentPage} pageCount={pageCount} pageSize={costsPageSize} total={costs.length} />
          ) : null}
        </SectionCard>
      )}

      {/* Edit dialog: mounted only while editing; owns its form state. */}
      {editCost ? <EditCostDialog cost={editCost} onClose={handleCloseEdit} onSaved={handleEditSaved} /> : null}

      {/* Delete confirmation dialog: requires an explicit click to proceed. */}
      <Dialog
        onClose={handleCloseDelete}
        open={Boolean(deleteCost)}
        transitionDuration={0}
      >
        <DialogTitle>Delete cost?</DialogTitle>
        <DialogContent dividers>
          {deleteCost ? (
            <Stack spacing={1}>
              {deleteFeedback ? (
                <Alert severity="error">{deleteFeedback}</Alert>
              ) : null}

              <Typography>
                Are you sure you want to delete this cost? This action cannot be
                undone.
              </Typography>
              <Typography>
                Description: <strong>{deleteCost.description}</strong>
              </Typography>
              <Typography>
                Category: <strong>{deleteCost.category}</strong>
              </Typography>
              {/* Show the row's key fields so the user confirms the right cost. */}
              <Typography>
                Sum:{' '}
                <strong>
                  {formatStoredAmount(deleteCost.sum, deleteCost.currency)} {deleteCost.currency}
                </strong>
              </Typography>
              {/* Date/time shown last, same order as the table columns. */}
              <Typography>
                Date: <strong>{formatDateForDisplay(deleteCost.date)}</strong>
              </Typography>
              <Typography>
                Time: <strong>{formatTime(deleteCost.date)}</strong>
              </Typography>
            </Stack>
          ) : null}
        </DialogContent>
        {/* No form here: Delete calls handleConfirmDelete directly on click. */}
        <DialogActions>
          <Button onClick={handleCloseDelete}>Cancel</Button>
          <Button color="error" onClick={handleConfirmDelete} variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default ManageCostsPage;
