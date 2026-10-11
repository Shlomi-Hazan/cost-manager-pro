import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SortableReportTable from './SortableReportTable.jsx';
import theme from '../../theme.js';

// TEAM EXTENSION test (X-006): protects sort-header click behavior
// (ascending/descending toggle, active-column indicator) shared by both
// Monthly and Yearly reports through this one component.
const costs = [
  {
    id: 'cost-1',
    sum: 25.5,
    currency: 'EURO',
    category: 'Shopping',
    description: 'car',
    date: {
      day: 24,
      month: 8,
      year: 2026,
      hour: 0,
      minute: 5
    }
  }
];

function renderTable(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SortableReportTable
        costs={costs}
        dateMode="monthly"
        onRequestSort={vi.fn()}
        sortDirection="asc"
        sortKey={null}
        {...props}
      />
    </ThemeProvider>
  );
}

describe('SortableReportTable', () => {
  it('uses Day as the Monthly first header', () => {
    renderTable({ dateMode: 'monthly' });

    expect(screen.getByRole('columnheader', { name: 'Day' })).toBeInTheDocument();
  });

  it('uses Date as the Yearly first header', () => {
    renderTable({ dateMode: 'yearly' });

    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
  });

  it('renders all six headers as interactive sort controls', () => {
    renderTable();

    for (const header of ['Day', 'Time', 'Description', 'Category', 'Sum', 'Currency']) {
      expect(screen.getByRole('button', { name: header })).toBeInTheDocument();
    }
  });

  it('exposes active sort direction on the active header', () => {
    renderTable({ sortKey: 'sum', sortDirection: 'desc' });

    expect(screen.getByRole('columnheader', { name: 'Sum' })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });

  it('formats Monthly rows as Day plus HH:mm', () => {
    renderTable({ dateMode: 'monthly' });

    const row = within(screen.getByRole('table', { name: 'Monthly report costs' }))
      .getByRole('row', { name: /car/i });

    expect(within(row).getByText('24')).toBeInTheDocument();
    expect(within(row).getByText('00:05')).toBeInTheDocument();
  });

  it('formats Yearly rows as DD/MM/YYYY plus HH:mm', () => {
    renderTable({ dateMode: 'yearly' });

    const row = within(screen.getByRole('table', { name: 'Yearly report costs' }))
      .getByRole('row', { name: /car/i });

    expect(within(row).getByText('24/08/2026')).toBeInTheDocument();
    expect(within(row).getByText('00:05')).toBeInTheDocument();
  });

  it('displays report values without exposing cost IDs', () => {
    renderTable();

    expect(screen.getByText('car')).toBeInTheDocument();
    expect(screen.getByText('Shopping')).toBeInTheDocument();
    expect(screen.getByText('25.50')).toBeInTheDocument();
    expect(screen.getByText('EURO')).toBeInTheDocument();
    expect(screen.queryByText('cost-1')).not.toBeInTheDocument();
  });

  it('invokes the requested sort key when a header is clicked', async () => {
    const user = userEvent.setup();
    const onRequestSort = vi.fn();
    renderTable({ onRequestSort });

    await user.click(screen.getByRole('button', { name: 'Time' }));

    expect(onRequestSort).toHaveBeenCalledWith('time');
  });
});
