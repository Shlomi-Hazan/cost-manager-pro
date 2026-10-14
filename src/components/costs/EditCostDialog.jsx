import { useState } from 'react';
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
  Stack,
  TextField
} from '@mui/material';
import { commonCategories } from '../../constants/categories.js';
import { supportedCurrencies } from '../../constants/currencies.js';
import { costsDatabase } from '../../lib/costsDatabase.js';
import { validateCostInput } from '../../lib/costInput.js';
import { getAmountDataQualityNotes } from '../../lib/dataQuality.js';
import { getCostInputMessages } from '../../utils/costInputMessages.js';
import { formatDateForInput, formatTime } from '../../utils/dateTime.js';
import { getStorageErrorMessage } from '../../utils/storageErrorMessage.js';

/*
 * M3.1A: the edit dialog owns ITS OWN form state. Before, the draft values
 * lived in ManageCostsPage next to the whole expense table, so every keystroke
 * re-rendered every row (1.3 s per key at 2,000 expenses on a throttled phone).
 * Now typing re-renders only this component. It validates and saves exactly as
 * before (same validation policy, same db.updateCost call) and reports the
 * outcome to the page, which refreshes the list.
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

/**
 * @param {object} props
 * @param {object} props.cost - The stored expense being edited.
 * @param {function} props.onClose - Called when the user cancels.
 * @param {function(string): void} props.onSaved - Called after a save attempt
 *   that changed the store's answer: 'updated' or 'missing' (id no longer exists).
 */
function EditCostDialog({ cost, onClose, onSaved }) {
  const [editValues, setEditValues] = useState(() => createEditValues(cost));
  const [editErrors, setEditErrors] = useState({});
  const [editFeedback, setEditFeedback] = useState('');
  const editCost = cost;

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

      // A null result means the id no longer exists (e.g. deleted from
      // another tab) — not a validation failure, so the page refreshes the
      // list and tells the user what happened rather than showing a form error.
      onSaved(updatedCost === null ? 'missing' : 'updated');
    } catch (error) {
      const message = getDatabaseErrorMessage(
        error,
        'Could not update cost. Please review the fields and try again.'
      );

      setEditFeedback(message);
    }
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={onClose}
      open
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
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save Changes
            </Button>
          </DialogActions>
        </Box>
    </Dialog>
  );
}

export default EditCostDialog;
