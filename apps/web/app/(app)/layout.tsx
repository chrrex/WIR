import { MeProvider } from '@/lib/me';
import { Shell } from '@/components/Shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <Shell>{children}</Shell>
    </MeProvider>
  );
}
