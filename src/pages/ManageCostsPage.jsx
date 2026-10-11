import { useEffect, useState } from 'react';
// Icons for the per-row Edit/Delete buttons and the empty-state alert.
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
// MUI primitives: table for the list, dialogs for the edit/delete forms.
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  // Remaining components: the saved-costs table and its containers.
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
// Shared UI components, then local constants/services/utils below.
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import { commonCategories } from '../constants/categories.js';
import { supportedCurrencies } from '../constants/currencies.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import { validateCostInput } from '../lib/costInput.js';
import { getAmountDataQualityNotes } from '../lib/dataQuality.js';
import { getCostInputMessages } from '../utils/costInputMessages.js';
import {
  formatDateForDisplay,
  formatDateForInput,
  formatTime
} from '../utils/dateTime.js';
import { formatStoredAmount } from '../lib/money/format.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

/*
 * TEAM EXTENSION (X-002/X-003): lets the user view, edit, and delete
 * existing costs, none of which the official specification requires — it
 * only requires that costs can be added. This screen relies entirely on
 * db.js's id-based getAllCosts/updateCost/deleteCost extensions (see
 * src/lib/db.js); it never touches localStorage directly, and never edits
 * the auto-generated id.
 */

// Converts a stored cost's raw fields into the shape the edit dialog's form
// controls expect (all-string sum, HTML date/time input formats).
function createEditValues(cost) {
  return {
    sum: String(cost.sum),
    currency: cost.currency,
    category: cost.category,
    description: cost.description,
    date: formatDateForInput(cost.date),
    time: formatTime(cost.date)
  };
}

// Delegates to the central policy (lib/costInput.js). `original` is the
// stored record: a field the user left unchanged is not revalidated and keeps
// its exact stored value, so editing one field of an old record (for example
// an amount with extra decimals, or a zero or negative amount from before
// the current rules) never fails on, or rewrites, the fields that were not
// touched. Only text the user changed has to meet today's rules.
function validateEditValues(values, original) {
  const result = validateCostInput(values, {
    sum: original.sum,
    category: original.category,
    description: original.description,
    date: formatDateForInput(original.date),
    time: formatTime(original.date)
  });
  const { value } = result;

  return {
    errors: getCostInputMessages(result.errors),
    isValid: result.isValid,
    sum: value.sum,
    category: value.category,
    description: value.description,
    // Changed parts come from the form; unchanged parts stay exactly as stored.
    date: {
      day: value.date?.day ?? original.date.day,
      month: value.date?.month ?? original.date.month,
      year: value.date?.year ?? original.date.year,
      hour: value.time?.hour ?? original.date.hour,
      minute: value.time?.minute ?? original.date.minute
    }
  };
}

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

// Translates db.js's date-validation error into a friendlier form message.
function getDatabaseErrorMessage(error, fallbackMessage) {
  const storageMessage = getStorageErrorMessage(error);

  if (storageMessage) {
    return storageMessage;
  }

  if (error instanceof Error && error.message.includes('real calendar date')) {
    return 'Enter a real calendar date.';
  }

  return fallbackMessage;
}

function ManageCostsPage() {
  // Saved-costs list, a page-level feedback banner, and separate
  // edit/delete dialog state (each dialog has its own draft values,
  // errors, and feedback so the two flows never interfere with each other).
  const [costList, setCostList] = useState(loadCostList);
  const { costs, errorMessage: loadErrorMessage } = costList;
  const [feedback, setFeedback] = useState(null);
  const [editCost, setEditCost] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [editFeedback, setEditFeedback] = useState('');
  const [deleteCost, setDeleteCost] = useState(null);
  const [deleteFeedback, setDeleteFeedback] = useState('');

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

  // Opens the edit dialog pre-filled with this row's current values.
  function handleOpenEdit(cost) {
    setEditCost(cost);
    setEditValues(createEditValues(cost));
    setEditErrors({});
    setEditFeedback('');
    setFeedback(null);
  }

  // Closing without saving discards the in-progress edit entirely.
  function handleCloseEdit() {
    setEditCost(null);
    setEditValues(null);
    setEditErrors({});
    setEditFeedback('');
  }

  // Generic field handler for the edit dialog's plain text/select inputs.
  function handleEditFieldChange(event) {
    const { name, value } = event.target;

    setEditValues((currentValues) => ({
      ...currentValues,
      [name]: value
    }));
    setEditErrors((currentErrors) => ({
      ...currentErrors,
      [name]: undefined
    }));
    setEditFeedback('');
  }

  // Autocomplete fires onChange for a picked suggestion, onInputChange for
  // free typing; both update the same category field.
  function handleCategoryChange(_event, value) {
    setEditValues((currentValues) => ({
      ...currentValues,
      category: value ?? ''
    }));
    setEditErrors((currentErrors) => ({
      ...currentErrors,
      category: undefined
    }));
    setEditFeedback('');
  }

  // ...and onInputChange for free typing; both update the same field.
  function handleCategoryInputChange(_event, value) {
    setEditValues((currentValues) => ({
      ...currentValues,
      category: value
    }));
    setEditErrors((currentErrors) => ({
      ...currentErrors,
      category: undefined
    }));
    setEditFeedback('');
  }

  // Validates locally first, then calls the required-plus-extension
  // updateCost(); a thrown validation error surfaces as editFeedback.
  function handleSaveEdit(event) {
    event.preventDefault();
    setEditFeedback('');

    const validation = validateEditValues(editValues, editCost);

    setEditErrors(validation.errors);

    if (!validation.isValid) {
      setEditFeedback('Could not update cost. Please review the fields and try again.');
      return;
    }

    try {
      // updateCost() preserves editCost.id — this can only ever change the
      // sum/currency/category/description/date of that specific row.
      const updatedCost = costsDatabase.updateCost(editCost.id, {
        sum: validation.sum,
        currency: editValues.currency,
        category: validation.category,
        description: validation.description,
        date: validation.date
      });

      loadCosts();

      // A null result means the id no longer exists (e.g. deleted from
      // another tab) — not a validation failure, so this refreshes the
      // list and tells the user what happened rather than showing a form
      // error.
      if (updatedCost === null) {
        handleCloseEdit();
        setFeedback({
          severity: 'warning',
          message: 'This cost no longer exists. The list has been refreshed.'
        });
        return;
      }

      handleCloseEdit();
      setFeedback({
        severity: 'success',
        message: 'Cost updated successfully.'
      });
    } catch (error) {
      const message = getDatabaseErrorMessage(
        error,
        'Could not update cost. Please review the fields and try again.'
      );

      setEditFeedback(message);
    }
  }

  // Delete flow: opening the dialog only stages the target cost; deleteCost()
  // itself only runs once the user confirms below.
  function handleOpenDelete(cost) {
    setDeleteCost(cost);
    setDeleteFeedback('');
    setFeedback(null);
  }

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
              {/* One row per saved cost, with per-row edit/delete buttons. */}
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell>{formatDateForDisplay(cost.date)}</TableCell>
                    <TableCell>{formatTime(cost.date)}</TableCell>
                    <TableCell>{cost.description}</TableCell>
                    <TableCell>{cost.category}</TableCell>
                    <TableCell align="right">
                      {formatStoredAmount(cost.sum, cost.currency)}
                    </TableCell>
                    <TableCell>{cost.currency}</TableCell>
                    <TableCell align="right">
                      {/* Edit opens a full-form dialog; Delete asks for confirmation. */}
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ justifyContent: 'flex-end' }}
                      >
                        <Button
                          onClick={() => handleOpenEdit(cost)}
                          size="small"
                          startIcon={<EditOutlinedIcon aria-hidden="true" />}
                        >
                          Edit
                        </Button>
                        {/* Delete is the destructive action: colored + confirmed. */}
                        <Button
                          color="error"
                          onClick={() => handleOpenDelete(cost)}
                          size="small"
                          startIcon={<DeleteOutlineIcon aria-hidden="true" />}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      )}

      {/* Edit dialog: full editable payload (X-002), submitted as a form. */}
      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={handleCloseEdit}
        open={Boolean(editCost && editValues)}
        transitionDuration={0}
      >
        <Box component="form" onSubmit={handleSaveEdit}>
          <DialogTitle>Edit Cost</DialogTitle>
          <DialogContent dividers>
            {editValues ? (
              <Stack spacing={3} sx={{ pt: 1 }}>
                {editFeedback ? (
                  <Alert severity="error">{editFeedback}</Alert>
                ) : null}

                {/* Sum and currency side by side, same layout as Add Cost. */}
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'minmax(0, 1fr) 160px'
                    }
                  }}
                >
                  {/* Sum: numeric keyboard on mobile, otherwise a plain text input. */}
                  <TextField
                    error={Boolean(editErrors.sum)}
                    helperText={
                      editErrors.sum ??
                      (editValues.sum.trim() === String(editCost.sum) &&
                      getAmountDataQualityNotes(editCost).length > 0
                        ? 'This saved amount is kept exactly as stored. A new amount must be greater than zero and use the currency\'s decimal places.'
                        : 'Use digits and an optional decimal point, for example 12.50.')
                    }
                    inputMode="decimal"
                    label="Sum"
                    name="sum"
                    onChange={handleEditFieldChange}
                    value={editValues.sum}
                  />
                  {/* Currency select, restricted to the four required identifiers. */}
                  <TextField
                    error={Boolean(editErrors.currency)}
                    helperText={editErrors.currency ?? ' '}
                    label="Currency"
                    name="currency"
                    onChange={handleEditFieldChange}
                    select
                    value={editValues.currency}
                  >
                    {supportedCurrencies.map((currency) => (
                      <MenuItem key={currency} value={currency}>
                        {currency}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                {/* Same category autocomplete as Add Cost (freeSolo suggestions). */}
                <Autocomplete
                  freeSolo
                  inputValue={editValues.category}
                  onChange={handleCategoryChange}
                  onInputChange={handleCategoryInputChange}
                  openOnFocus
                  options={commonCategories}
                  // MUI Autocomplete requires the text field to be supplied this way.
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      error={Boolean(editErrors.category)}
                      helperText={
                        editErrors.category ??
                        'Choose a suggestion or type a custom category.'
                      }
                      label="Category"
                      name="category"
                    />
                  )}
                />

                {/* Multiline description field. */}
                <TextField
                  error={Boolean(editErrors.description)}
                  helperText={editErrors.description ?? ' '}
                  label="Description"
                  multiline
                  name="description"
                  onChange={handleEditFieldChange}
                  rows={3}
                  value={editValues.description}
                />

                {/* Date and time side by side on wide screens, stacked on mobile. */}
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'minmax(0, 1fr) minmax(0, 1fr)'
                    }
                  }}
                >
                  {/* shrink: true keeps the label above the value once a date is set. */}
                  <TextField
                    error={Boolean(editErrors.date)}
                    helperText={editErrors.date ?? ' '}
                    label="Date"
                    name="date"
                    onChange={handleEditFieldChange}
                    slotProps={{
                      inputLabel: {
                        shrink: true
                      }
                    }}
                    type="date"
                    value={editValues.date}
                  />
                  {/* Time field mirrors the date field's slotProps/type setup. */}
                  <TextField
                    error={Boolean(editErrors.time)}
                    helperText={editErrors.time ?? ' '}
                    label="Time"
                    name="time"
                    onChange={handleEditFieldChange}
                    slotProps={{
                      inputLabel: {
                        shrink: true
                      }
                    }}
                    type="time"
                    value={editValues.time}
                  />
                </Box>
              </Stack>
            ) : null}
          </DialogContent>
          {/* type="submit" triggers the form's onSubmit (handleSaveEdit) above. */}
          <DialogActions>
            <Button onClick={handleCloseEdit}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save Changes
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

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
