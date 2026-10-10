import { MeProvider } from '@/lib/me';
import { Shell } from '@/components/Shell';
import { BadgesProvider } from '@/lib/badges';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <BadgesProvider>
        <Shell>{children}</Shell>
      </BadgesProvider>
    </MeProvider>
  );
}
