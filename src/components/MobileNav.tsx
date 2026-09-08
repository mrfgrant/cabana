'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Thumb-reach navigation for phones. The three things a manager touches
 * mid-shift. The full nav stays at the top for everything else.
 */
export default function MobileNav({ today }: { today: string }) {
  const path = usePathname();
  const params = useSearchParams();

  // Print is "today's sheet" unless you are already looking at another date.
  const printDate = path === '/admin/print' ? params.get('date') ?? today : today;

  const items = [
    { href: '/admin', label: 'Today', active: path === '/admin' },
    {
      href: `/admin/print?date=${printDate}`,
      label: 'Print sheet',
      active: path === '/admin/print',
    },
    { href: '/admin/calendar', label: 'Calendar', active: path.startsWith('/admin/calendar') },
  ];

  return (
    <nav className="mobile-nav no-print" aria-label="Quick navigation">
      {items.map((i) => (
        <Link key={i.label} href={i.href} aria-current={i.active ? 'page' : undefined}>
          <span className="mobile-nav-icon" aria-hidden="true">
            {i.label === 'Today' ? '●' : i.label === 'Print sheet' ? '▤' : '▦'}
          </span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
