import { useMemo, useState } from 'react';
// One icon per page entry, in the same order as the pages array below.
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
// One page component per navigation entry, plus the shared layout shell.
import DashboardPage from './pages/DashboardPage.jsx';
import AddCostPage from './pages/AddCostPage.jsx';
import ManageCostsPage from './pages/ManageCostsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ChartsPage from './pages/ChartsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import StorageStatusBanner from './components/common/StorageStatusBanner.jsx';

/*
 * The application is a small single-page app with no URL-based routing
 * (a deliberate architecture decision — see docs/ARCHITECTURE.md §6):
 * `activePageId` state below simply selects which page component to render
 * inside the shared AppLayout shell. Each entry pairs a navigation
 * label/icon with the page component it activates.
 */
const pages = [
  // Dashboard: the landing page, first in both this list and the tab bar.
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardOutlinedIcon aria-hidden="true" fontSize="small" />,
    component: DashboardPage
  },
  // Add Cost and Manage Costs: the two cost-editing pages.
  {
    id: 'add-cost',
    label: 'Add Cost',
    icon: <AddCircleOutlineIcon aria-hidden="true" fontSize="small" />,
    component: AddCostPage
  },
  // Manage Costs: view/edit/delete existing entries (X-002/X-003).
  {
    id: 'manage-costs',
    label: 'Manage Costs',
    icon: <EditNoteOutlinedIcon aria-hidden="true" fontSize="small" />,
    component: ManageCostsPage
  },
  // Required-output pages: Reports (R-050) and Charts (R-070/R-080).
  {
    id: 'reports',
    label: 'Reports',
    icon: <AssessmentOutlinedIcon aria-hidden="true" fontSize="small" />,
    component: ReportsPage
  },
  // Charts: pie (R-070/R-071) and, nested inside the page, bar (R-080/R-081).
  {
    id: 'charts',
    label: 'Charts',
    icon: <DonutLargeOutlinedIcon aria-hidden="true" fontSize="small" />,
    component: ChartsPage
  },
  // Settings: least frequently visited, listed last in the tab bar.
  {
    id: 'settings',
    label: 'Settings',
    icon: <SettingsOutlinedIcon aria-hidden="true" fontSize="small" />,
    component: SettingsPage
  }
];

function App() {
  const [activePageId, setActivePageId] = useState(pages[0].id);

  // Falls back to the first page if activePageId ever fails to match (it
  // shouldn't, since only AppLayout's own tabs can set it).
  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? pages[0],
    [activePageId]
  );

  const ActivePage = activePage.component;

  return (
    <AppLayout
      activePageId={activePageId}
      appTitle="Cost Manager"
      navigationItems={pages}
      onNavigate={setActivePageId}
    >
      {/* Only renders when stored expenses cannot be used (M1). */}
      <StorageStatusBanner activePageId={activePageId} onNavigate={setActivePageId} />
      <ActivePage onNavigate={setActivePageId} />
    </AppLayout>
  );
}

export default App;
