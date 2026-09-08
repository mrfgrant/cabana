import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { logoutAction } from './actions';
import MobileNav from '@/components/MobileNav';
import { todayInVenueTz } from '@/lib/format';
import { Suspense } from 'react';
import './admin.css';

export const dynamic = 'force-dynamic';

const LINKS = [
  ['/admin', 'Today'],
  ['/admin/calendar', 'Calendar'],
  ['/admin/bookings', 'Bookings'],
  ['/admin/customers', 'Customers'],
  ['/admin/reports', 'Reports'],
  ['/admin/managers', 'Managers'],
  ['/admin/settings', 'Settings'],
  ['/admin/help', 'Help'],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) return <div className="admin">{children}</div>;

  return (
    <div className="admin">
      <div className="admin-bar">
        <span className="mark">1942</span>
        <span className="who">
          {session.name}
          {' · '}
          <form action={logoutAction} style={{ display: 'inline' }}>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 0,
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Sign out
            </button>
          </form>
        </span>
      </div>
      <nav className="admin-nav">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="admin-body">{children}</div>
      <Suspense>
        <MobileNav today={todayInVenueTz()} />
      </Suspense>
    </div>
  );
}
