import { useState } from 'react';

export interface OptionsNavItem {
  id: string;
  label: string;
}

export interface OptionsNavProps {
  groups: Array<{ label: string; items: OptionsNavItem[] }>;
}

export function OptionsNav({ groups }: OptionsNavProps) {
  const [active, setActive] = useState<string | undefined>(
    groups[0]?.items[0]?.id,
  );

  return (
    <nav className="options-nav" aria-label="设置页目录">
      {groups.map((group) => (
        <div key={group.label} className="options-nav-group">
          <p className="options-nav-title">{group.label}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={active === item.id ? 'active' : undefined}
                  onClick={() => setActive(item.id)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
