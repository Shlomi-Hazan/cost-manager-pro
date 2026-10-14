import { memo } from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Button, Stack, TableCell, TableRow } from '@mui/material';
import { formatStoredAmount } from '../../lib/money/format.js';
import { formatDateForDisplay, formatTime } from '../../utils/dateTime.js';

/*
 * One saved-cost row. Memoized because the page re-renders for unrelated
 * reasons (a dialog opening, a feedback banner) and a row only needs to
 * render again when ITS cost changes. The page passes stable callbacks, so the
 * default shallow comparison is enough. A cost object is replaced only when
 * the list is reloaded, which is exactly when its row should refresh.
 */
function CostTableRow({ cost, onDelete, onEdit }) {
  return (
    <TableRow>
      <TableCell>{formatDateForDisplay(cost.date)}</TableCell>
      <TableCell>{formatTime(cost.date)}</TableCell>
      <TableCell>{cost.description}</TableCell>
      <TableCell>{cost.category}</TableCell>
      <TableCell align="right">{formatStoredAmount(cost.sum, cost.currency)}</TableCell>
      <TableCell>{cost.currency}</TableCell>
      <TableCell align="right">
        {/* Edit opens a full-form dialog; Delete asks for confirmation. */}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => onEdit(cost)} size="small" startIcon={<EditOutlinedIcon aria-hidden="true" />}>
            Edit
          </Button>
          {/* Delete is the destructive action: colored + confirmed. */}
          <Button color="error" onClick={() => onDelete(cost)} size="small" startIcon={<DeleteOutlineIcon aria-hidden="true" />}>
            Delete
          </Button>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

export default memo(CostTableRow);
