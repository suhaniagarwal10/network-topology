import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Building combobox for the node form: a real dropdown of every known
 * building (grouped by site) plus type-to-filter and Tab autocomplete.
 *
 * options: [{ name, site, switchCount }]
 * onPick(option) fires when a listed building is chosen, so the caller can
 * autofill related fields (e.g. the site).
 */
export default function BuildingPicker({
  id,
  value,
  options,
  preferredSite,
  onChange,
  onPick,
  onBlur,
  disabled,
  invalid,
  placeholder,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Show the full list when opened from the toggle, filtered list while typing.
  const [showAll, setShowAll] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = (showAll ? '' : value || '').trim().toLowerCase();
    const scored = [];
    for (const opt of options) {
      const name = opt.name.toLowerCase();
      const site = (opt.site || '').toLowerCase();
      let score;
      if (!q) score = 2;
      else if (name.startsWith(q)) score = 0;
      else if (name.includes(q)) score = 1;
      else if (site.includes(q)) score = 2;
      else continue;
      // Buildings in the site already picked for this node come first.
      const siteRank = preferredSite && opt.site === preferredSite ? 0 : 1;
      scored.push({ opt, score, siteRank });
    }
    scored.sort(
      (a, b) =>
        a.siteRank - b.siteRank ||
        a.score - b.score ||
        a.opt.name.localeCompare(b.opt.name, undefined, { numeric: true })
    );
    return scored.map((s) => s.opt);
  }, [options, value, showAll, preferredSite]);

  // Ghost-text completion for the best prefix match ("DC1 B" -> "DC1 Building A").
  const completion = useMemo(() => {
    const v = value || '';
    if (!v || showAll || !open) return '';
    const top = matches[0];
    if (!top || !top.name.toLowerCase().startsWith(v.toLowerCase()) || top.name.length === v.length) return '';
    return top.name.slice(v.length);
  }, [value, matches, showAll, open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const pick = (opt) => {
    onChange(opt.name);
    onPick?.(opt);
    setOpen(false);
    setShowAll(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setActiveIndex(0); return; }
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[activeIndex]) {
        e.preventDefault();
        pick(matches[activeIndex]);
      }
    } else if (e.key === 'Tab') {
      // Tab accepts the autocomplete suggestion, then moves on as usual.
      if (open && completion && matches[0]) pick(matches[0]);
      else setOpen(false);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  // Group rows by site for the dropdown, keeping the sorted order.
  const groups = useMemo(() => {
    const out = [];
    matches.forEach((opt, index) => {
      const site = opt.site || 'Other';
      let g = out.find((x) => x.site === site);
      if (!g) { g = { site, rows: [] }; out.push(g); }
      g.rows.push({ opt, index });
    });
    return out;
  }, [matches]);

  return (
    <div className={`bpicker${disabled ? ' disabled' : ''}`} ref={boxRef}>
      <div className="bpicker-field">
        {completion && (
          <div className="bpicker-ghost" aria-hidden="true">
            <span className="bpicker-ghost-typed">{value}</span>
            {completion}
          </div>
        )}
        <input
          id={id}
          ref={inputRef}
          value={value || ''}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="both"
          onChange={(e) => {
            onChange(e.target.value);
            setShowAll(false);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          className={invalid ? 'input-invalid' : ''}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          className="bpicker-toggle"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Show all buildings"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open && showAll) { setOpen(false); return; }
            setShowAll(true);
            setOpen(true);
            setActiveIndex(0);
            inputRef.current?.focus();
          }}
        >
          ▾
        </button>
      </div>

      {open && !disabled && (
        <div className="bpicker-list" id={`${id}-list`} role="listbox" ref={listRef}>
          {matches.length === 0 ? (
            <div className="bpicker-empty">
              No building matches “{value}”. It will be created as a new building.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.site}>
                <div className="bpicker-site">
                  {g.site}
                  {preferredSite && g.site === preferredSite && <span className="bpicker-site-tag">this site</span>}
                </div>
                {g.rows.map(({ opt, index }) => (
                  <button
                    type="button"
                    key={opt.name}
                    data-index={index}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`bpicker-row${index === activeIndex ? ' active' : ''}${opt.name === value ? ' current' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(opt)}
                  >
                    <span className="bpicker-name">🏢 {opt.name}</span>
                    {opt.switchCount != null && <span className="bpicker-count">{opt.switchCount} sw</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
