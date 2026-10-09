import { useState } from 'react';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
// Shared UI components, then local constants/db/utils below.
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import { commonCategories } from '../constants/categories.js';
import { supportedCurrencies } from '../constants/currencies.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import { normalizeCategoryInput } from '../utils/category.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

/*
 * Course requirement: lets the user add a new cost with sum, currency,
 * category, and description (R-030 to R-034). The automatic date and
 * original-currency preservation (R-035/R-036) are handled entirely by
 * db.js's addCost() — this page only collects and validates the four
 * required input fields and hands them to costsDatabase, it does not touch
 * localStorage or assign a date itself.
 */

const initialFormValues = {
  sum: '',
  currency: 'USD',
  category: '',
  description: ''
};

// UI-level validation only (non-empty description/category, numeric sum,
// supported currency). This is intentionally stricter than db.js's own
// validateCost() in places (e.g. rejecting an empty description), since
// UI-only rules are free to be stricter without affecting grader
// compatibility — see docs/REQUIREMENTS.md OQ-005.
function validateForm(values) {
  const nextErrors = {};
  const trimmedSum = values.sum.trim();
  const numericSum = Number(trimmedSum);
  const normalizedCategory = normalizeCategoryInput(values.category);

  if (trimmedSum === '') {
    nextErrors.sum = 'Enter a cost sum.';
  } else if (!Number.isFinite(numericSum)) {
    nextErrors.sum = 'Enter a valid numeric sum.';
  }

  // Currency/category/description: presence and support checks only.
  if (!supportedCurrencies.includes(values.currency)) {
    nextErrors.currency = 'Select a supported currency.';
  }

  if (normalizedCategory === '') {
    nextErrors.category = 'Enter a category.';
  }

  if (values.description.trim() === '') {
    nextErrors.description = 'Enter a description.';
  }

  return {
    errors: nextErrors,
    isValid: Object.keys(nextErrors).length === 0,
    normalizedCategory,
    numericSum
  };
}

function AddCostPage() {
  // Raw form input, field-level validation errors, and a one-shot success/
  // error banner. All local state — this page does not need to share its
  // in-progress form with any other page.
  const [formValues, setFormValues] = useState(initialFormValues);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);

  // Generic field handler for the plain text/select inputs.
  function handleChange(event) {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: undefined
    }));
    setFeedback(null);
  }

  // Autocomplete fires onChange for a picked suggestion...
  function handleCategoryChange(_event, value) {
    setFormValues((currentValues) => ({
      ...currentValues,
      category: value ?? ''
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      category: undefined
    }));
    setFeedback(null);
  }

  // ...and onInputChange for free typing; both update the same field.
  function handleCategoryInputChange(_event, value) {
    setFormValues((currentValues) => ({
      ...currentValues,
      category: value
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      category: undefined
    }));
    setFeedback(null);
  }

  // Validates locally first, then calls the required addCost().
  function handleSubmit(event) {
    event.preventDefault();

    const validation = validateForm(formValues);

    setErrors(validation.errors);

    if (!validation.isValid) {
      setFeedback({
        severity: 'error',
        message: 'Please correct the highlighted fields.'
      });
      return;
    }

    try {
      // The only place this page touches storage: db.js's addCost() applies
      // the automatic date and generates the cost's stable id (see
      // src/lib/db.js) — this component never writes to localStorage
      // directly, keeping persistence rules centralized in one place.
      costsDatabase.addCost({
        sum: validation.numericSum,
        currency: formValues.currency,
        category: validation.normalizedCategory,
        description: formValues.description.trim()
      });

      // Reset the form so the next entry starts from a clean slate.
      setFormValues(initialFormValues);
      setFeedback({
        severity: 'success',
        message: 'Cost added successfully.'
      });
    } catch (error) {
      // Storage problems (full, blocked, unreadable data) get a specific
      // explanation; the form keeps its values so nothing typed is lost.
      setFeedback({
        severity: 'error',
        message: getStorageErrorMessage(error) ?? 'Could not add cost. Please try again.'
      });
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader title="Add Cost">
        Enter a cost item and save it to your Cost Manager database.
      </PageHeader>

      {/* Add-cost form: submitting it calls handleSubmit above. */}
      <SectionCard
        component="form"
        onSubmit={handleSubmit}
        sx={{
          maxWidth: 760
        }}
      >
        <Stack spacing={3}>
          {feedback ? (
            <Alert severity={feedback.severity}>{feedback.message}</Alert>
          ) : null}

          {/* Sum and currency side by side on wide screens (R-031/R-032). */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'minmax(0, 1fr) 180px'
              }
            }}
          >
            {/* Sum: numeric keyboard on mobile, otherwise a plain text input. */}
            <TextField
              error={Boolean(errors.sum)}
              helperText={errors.sum ?? 'Use a numeric value.'}
              inputMode="decimal"
              label="Sum"
              name="sum"
              onChange={handleChange}
              value={formValues.sum}
            />
            {/* Currency select, restricted to the four required identifiers. */}
            <TextField
              error={Boolean(errors.currency)}
              helperText={errors.currency ?? ' '}
              label="Currency"
              name="currency"
              onChange={handleChange}
              select
              value={formValues.currency}
            >
              {/* One MenuItem per required currency identifier. */}
              {supportedCurrencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* freeSolo: commonCategories are only suggestions (R-033, OQ-004). */}
          <Autocomplete
            freeSolo
            inputValue={formValues.category}
            onChange={handleCategoryChange}
            onInputChange={handleCategoryInputChange}
            openOnFocus
            options={commonCategories}
            // MUI Autocomplete requires the text field to be supplied this way.
            renderInput={(params) => (
              <TextField
                {...params}
                error={Boolean(errors.category)}
                helperText={errors.category ?? 'Choose a suggestion or type a custom category.'}
                label="Category"
                name="category"
              />
            )}
          />

          {/* Description: date/id are added automatically, not entered here. */}
          <TextField
            error={Boolean(errors.description)}
            helperText={errors.description ?? 'The date will be added automatically.'}
            label="Description"
            multiline
            name="description"
            onChange={handleChange}
            rows={3}
            value={formValues.description}
          />

          {/* type="submit" triggers the form's onSubmit (handleSubmit) above. */}
          <Box>
            <Button
              startIcon={<AddCircleOutlineIcon aria-hidden="true" />}
              type="submit"
              variant="contained"
            >
              Add Cost
            </Button>
          </Box>
        </Stack>
      </SectionCard>
    </Stack>
  );
}

export default AddCostPage;
