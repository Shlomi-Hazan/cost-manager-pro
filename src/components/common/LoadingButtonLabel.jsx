import { CircularProgress, Stack } from '@mui/material';

// Small shared UI component: swaps a button's normal label for a spinner +
// status text while an async action (report/chart generation, export,
// Settings save) is in flight, so every busy button in the app looks and
// behaves the same way.
function LoadingButtonLabel({ children, isLoading, loadingText }) {
  return (
    <Stack
      component="span"
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Spinner replaces the label text only while isLoading is true. */}
      {isLoading ? (
        <CircularProgress color="inherit" size={16} thickness={5} />
      ) : null}
      <span aria-live="polite">{isLoading ? loadingText : children}</span>
    </Stack>
  );
}

export default LoadingButtonLabel;
