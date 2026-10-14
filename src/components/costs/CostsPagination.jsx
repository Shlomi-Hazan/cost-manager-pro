import { useEffect, useRef } from 'react';
import { Button, Stack, Typography } from '@mui/material';

/*
 * M3.1A: page controls for a long list. Plain buttons (no new dependency),
 * wrapping at 360 px. The status text names exactly which rows are shown and
 * is announced politely when the page changes. After a page change, focus
 * moves to that status text: the button that was pressed may have just become
 * disabled (for example "Next" on the last page), and focus must not be lost.
 */
function CostsPagination({ onPageChange, page, pageCount, pageSize, total }) {
  const statusRef = useRef(null);
  const changedByUser = useRef(false);
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  useEffect(() => {
    if (changedByUser.current) {
      changedByUser.current = false;
      statusRef.current?.focus();
    }
  }, [page]);

  function go(next) {
    changedByUser.current = true;
    onPageChange(next);
  }

  return (
    <Stack
      aria-label="Saved costs pages"
      component="nav"
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', px: 2, py: 1.5 }}
    >
      <Typography aria-live="polite" ref={statusRef} role="status" sx={{ '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }} tabIndex={-1} variant="body2">
        Showing {first}–{last} of {total} · Page {page + 1} of {pageCount}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button aria-label="First page" disabled={page === 0} onClick={() => go(0)} size="small" variant="outlined">First</Button>
        <Button aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} size="small" variant="outlined">Previous</Button>
        <Button aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => go(page + 1)} size="small" variant="outlined">Next</Button>
        <Button aria-label="Last page" disabled={page >= pageCount - 1} onClick={() => go(pageCount - 1)} size="small" variant="outlined">Last</Button>
      </Stack>
    </Stack>
  );
}

export default CostsPagination;
