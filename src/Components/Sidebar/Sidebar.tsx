import React from "react";
import type { MenuItem } from "../../App";
import type { User } from "../../Models/Usuarios";

export function Sidebar(props: {navs: readonly MenuItem[]; selected: string; onSelect: (k: string) => void; user: User; role: string; collapsed?: boolean; onToggle?: () => void;}) {
  const { navs, selected, onSelect, user, role, collapsed = false, onToggle } = props;
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const next: Record<string, boolean> = {};
    const walk = (nodes: readonly MenuItem[], path: string[] = []) => {
      nodes.forEach((n) => {
        const p = [...path, n.id];
        if (n.id === selected) p.slice(0, -1).forEach((id) => (next[id] = true));
        if (n.children?.length) walk(n.children, p);
      });
    };
    walk(navs);
    setOpen((prev) => ({ ...prev, ...next }));
  }, [selected, navs]);

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  const renderTree = (nodes: readonly MenuItem[], depth = 0) => (
    <ul className="sb-ul">
      {nodes.map((n) => {
        const hasChildren = !!n.children?.length;
        const expanded = !!open[n.id];
        const pad = 10 + depth * 14;

        if (hasChildren) {
          return (
            <li key={n.id} className="sb-li">
              <button
                className={`sideItem sideItem--folder ${collapsed ? "is-compact" : ""}`}
                style={{ paddingLeft: collapsed ? 12 : pad }}
                onClick={() => (collapsed ? onSelect(n.id) : toggle(n.id))}
                aria-expanded={!collapsed && expanded}
                title={n.label}
              >
                {!collapsed && <span className={`caret ${expanded ? "rot" : ""}`}>▸</span>}
                <span className="sb-icon-wrap" aria-hidden>
                  {n.icon ?? null}
                </span>
                {!collapsed && <span className="sideItem__label">{n.label}</span>}
              </button>
              {!collapsed && expanded && renderTree(n.children!, depth + 1)}
            </li>
          );
        }

        const active = selected === n.id;
        return (
          <li key={n.id} className="sb-li">
            <button
              className={`sideItem sideItem--leaf ${active ? "sideItem--active" : ""} ${collapsed ? "is-compact" : ""}`}
              style={{ paddingLeft: collapsed ? 12 : pad + 18 }}
              onClick={() => onSelect(n.id)}
              aria-current={active ? "page" : undefined}
              title={n.label}
            >
              <span className="sideItem__icon" aria-hidden="true">
                {n.icon ?? "•"}
              </span>
              {!collapsed && <span className="sideItem__label">{n.label}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`} aria-label="Navegación principal">
      <div className="sidebar__header">
        <div className="sb-brand">
          {!collapsed && (
            <>
              <span className="sb-logo" aria-hidden="true">
                🛠️
              </span>
              <span className="sb-title">Soporte Técnico</span>
            </>
          )}
        </div>
        <button className="sb-toggle" onClick={onToggle} aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="sidebar__nav" role="navigation">
        {renderTree(navs)}
      </nav>

      <div className="sidebar__footer">
        <div className="sb-prof__avatar" title={user?.displayName || "Usuario"}>
          {user?.displayName ? user.displayName[0] : "U"}
        </div>
        {!collapsed && (
          <div className="sb-prof__info">
            <div className="sb-prof__mail">{user?.mail || "usuario@empresa.com"}</div>
            <div className="sb-prof__mail" aria-hidden="true">
              {role}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}