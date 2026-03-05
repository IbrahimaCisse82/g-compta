import { AppProvider, useApp } from '@/stores/app-store';
import Landing from '@/components/Landing';
import AppShell from '@/components/AppShell';

function AppContent() {
  const { launched } = useApp();
  return launched ? <AppShell /> : <Landing />;
}

export default function Index() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
