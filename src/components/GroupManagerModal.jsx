import { useState, useMemo, useEffect } from 'react';
import { statusColor } from '../utils/graph.js';

export default function GroupManagerModal({
  isOpen,
  onClose,
  data,
  mappingIndex,
  onSaveGroup,
  onDeleteGroup,
  onHighlightGroup,
  onOpenGroup,
  initialEditingGroup = null,
  tick = 0,
}) {
  const [viewMode, setViewMode] = useState(initialEditingGroup ? 'editor' : 'list');
  const [groupName, setGroupName] = useState('');
  const [originalGroupName, setOriginalGroupName] = useState(null);
  const [selectedSwitchIds, setSelectedSwitchIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [switchFilterMode, setSwitchFilterMode] = useState('ALL'); // 'ALL' | 'SELECTED' | 'UNSELECTED'
  const [collapsedBuildings, setCollapsedBuildings] = useState(new Set());
  const [isPillsExpanded, setIsPillsExpanded] = useState(false);
  const [formError, setFormError] = useState('');
  const [revision, setRevision] = useState(0);

  // Collect all existing groups and their members - recomputes instantly on data, tick, or revision
  const groupsSummary = useMemo(() => {
    if (!data?.nodes) return [];
    const map = new Map();

    for (const node of data.nodes) {
      if (node.type !== 'switch' || !Array.isArray(node.groups)) continue;
      for (const g of node.groups) {
        if (!g) continue;
        if (!map.has(g)) {
          map.set(g, {
            name: g,
            switches: [],
            buildingCounts: new Map(),
          });
        }
        const item = map.get(g);
        item.switches.push(node);
        const bName = node.building || 'Unassigned';
        item.buildingCounts.set(bName, (item.buildingCounts.get(bName) || 0) + 1);
      }
    }

    return Array.from(map.values())
      .map(item => ({
        name: item.name,
        switches: item.switches,
        switchCount: item.switches.length,
        buildingBreakdown: Array.from(item.buildingCounts.entries()).map(([building, count]) => ({
          building,
          count,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.nodes, data?.groups, tick, revision]);

  // Open editor for a group or create new
  const startCreateNew = () => {
    setGroupName('');
    setOriginalGroupName(null);
    setSelectedSwitchIds(new Set());
    setFormError('');
    setSwitchFilterMode('ALL');
    setViewMode('editor');
  };

  const startEditGroup = (groupItem) => {
    setGroupName(groupItem.name);
    setOriginalGroupName(groupItem.name);
    setSelectedSwitchIds(new Set(groupItem.switches.map(s => s.id)));
    setFormError('');
    setSwitchFilterMode('ALL');
    setViewMode('editor');
  };

  useEffect(() => {
    if (initialEditingGroup) {
      const existing = groupsSummary.find(g => g.name === initialEditingGroup);
      if (existing) {
        startEditGroup(existing);
      } else {
        setGroupName(initialEditingGroup);
        setOriginalGroupName(null);
        setSelectedSwitchIds(new Set());
        setSwitchFilterMode('ALL');
        setViewMode('editor');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditingGroup]);

  // Building structure with switches filtered by site, search query, and selected/unselected state
  const buildingsWithSwitches = useMemo(() => {
    if (!data?.nodes || !mappingIndex?.buildings) return [];

    const query = searchQuery.trim().toLowerCase();
    const result = [];

    for (const b of mappingIndex.buildings) {
      if (siteFilter !== 'ALL' && b.site !== siteFilter) continue;

      const switches = b.switchIds
        .map(id => data.nodesById.get(id))
        .filter(Boolean)
        .filter(sw => {
          if (switchFilterMode === 'SELECTED' && !selectedSwitchIds.has(sw.id)) return false;
          if (switchFilterMode === 'UNSELECTED' && selectedSwitchIds.has(sw.id)) return false;
          if (!query) return true;
          return (
            sw.id.toLowerCase().includes(query) ||
            sw.name.toLowerCase().includes(query) ||
            (sw.ipAddress && sw.ipAddress.toLowerCase().includes(query)) ||
            b.name.toLowerCase().includes(query)
          );
        });

      if (switches.length > 0 || (!query && switchFilterMode === 'ALL')) {
        result.push({
          building: b,
          switches,
          totalInBuilding: b.switchIds.length,
        });
      }
    }

    return result;
  }, [data?.nodes, data?.nodesById, mappingIndex?.buildings, searchQuery, siteFilter, switchFilterMode, selectedSwitchIds, revision, tick]);

  const availableSites = useMemo(() => {
    if (!mappingIndex?.buildings) return [];
    return ['ALL', ...new Set(mappingIndex.buildings.map(b => b.site))].sort();
  }, [mappingIndex?.buildings]);

  // Toggle single switch
  const toggleSwitch = (id) => {
    setSelectedSwitchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select / Deselect all in a building
  const selectAllInBuilding = (switches) => {
    setSelectedSwitchIds(prev => {
      const next = new Set(prev);
      switches.forEach(sw => next.add(sw.id));
      return next;
    });
  };

  const deselectAllInBuilding = (switches) => {
    setSelectedSwitchIds(prev => {
      const next = new Set(prev);
      switches.forEach(sw => next.delete(sw.id));
      return next;
    });
  };

  // Buildings represented by current selection
  const selectedBuildingsCount = useMemo(() => {
    if (!data?.nodesById) return 0;
    const bSet = new Set();
    for (const id of selectedSwitchIds) {
      const sw = data.nodesById.get(id);
      if (sw?.building) bSet.add(sw.building);
    }
    return bSet.size;
  }, [data?.nodesById, selectedSwitchIds]);

  const toggleCollapse = (bId) => {
    setCollapsedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(bId)) next.delete(bId);
      else next.add(bId);
      return next;
    });
  };

  const expandAllBuildings = () => {
    setCollapsedBuildings(new Set());
  };

  const collapseAllBuildings = () => {
    if (!mappingIndex?.buildings) return;
    setCollapsedBuildings(new Set(mappingIndex.buildings.map(b => b.id)));
  };

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = groupName.trim();
    if (!trimmed) {
      setFormError('Please enter a group name.');
      return;
    }

    // Check collision if new or renamed
    if (trimmed !== originalGroupName && groupsSummary.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
      setFormError(`A group named "${trimmed}" already exists.`);
      return;
    }

    if (selectedSwitchIds.size === 0) {
      setFormError('Please select at least one switch for this group.');
      return;
    }

    onSaveGroup(trimmed, Array.from(selectedSwitchIds), originalGroupName);
    setRevision(r => r + 1);
    setViewMode('list');
    setGroupName('');
    setOriginalGroupName(null);
    setSelectedSwitchIds(new Set());
    setFormError('');
  };

  const handleDelete = (name) => {
    if (window.confirm(`Are you sure you want to delete the group "${name}"? This will remove this group tag from all member switches.`)) {
      onDeleteGroup(name);
      setRevision(r => r + 1);
      if (viewMode === 'editor' && originalGroupName === name) {
        setViewMode('list');
        setGroupName('');
        setOriginalGroupName(null);
        setSelectedSwitchIds(new Set());
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content group-manager-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 960, width: '92%', height: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="group-manager-header">
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>📁 Switch Group Manager</span>
              <span className="group-count-tag">{groupsSummary.length} groups</span>
            </h2>
            <div className="group-manager-subtitle">
              Create and manage custom groups combining selective switches from different buildings.
            </div>
          </div>
          <button className="close-btn" onClick={onClose} title="Close">×</button>
        </div>

        {/* View toggle / Navigation */}
        <div className="group-manager-nav">
          <button
            className={`nav-tab ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => { setViewMode('list'); setFormError(''); }}
          >
            📋 All Groups ({groupsSummary.length})
          </button>
          <button
            className={`nav-tab ${viewMode === 'editor' ? 'active' : ''}`}
            onClick={startCreateNew}
          >
            ➕ {viewMode === 'editor' && originalGroupName ? `Editing "${originalGroupName}"` : 'Create New Group'}
          </button>
        </div>

        {/* Modal Body */}
        <div className="group-manager-body" style={{ flex: 1, overflowY: 'auto' }}>
          {viewMode === 'list' ? (
            /* ================= List of Groups ================= */
            <div className="groups-list-view">
              {groupsSummary.length === 0 ? (
                <div className="empty-groups-state">
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                  <h3>No custom groups yet</h3>
                  <p>Create groups of switches across different buildings for targeted monitoring and filtering.</p>
                  <button className="btn-primary" onClick={startCreateNew} style={{ marginTop: 12 }}>
                    + Create First Group
                  </button>
                </div>
              ) : (
                <div className="groups-grid">
                  {groupsSummary.map(g => (
                    <div key={g.name} className="group-card">
                      <div className="group-card-top">
                        <div className="group-card-title">
                          <span className="group-icon">🏷️</span>
                          <strong>{g.name}</strong>
                        </div>
                        <span className="group-pill-count">{g.switchCount} switches</span>
                      </div>

                      <div className="group-card-buildings">
                        <span className="building-label">Across {g.buildingBreakdown.length} building{g.buildingBreakdown.length === 1 ? '' : 's'}:</span>
                        <div className="building-chips-container">
                          {g.buildingBreakdown.map(b => (
                            <span key={b.building} className="building-chip">
                              {b.building} <b className="chip-count">({b.count})</b>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="group-card-actions">
                        <button
                          className="btn-group-action highlight"
                          onClick={() => {
                            if (onOpenGroup) onOpenGroup(g.name);
                            else if (onHighlightGroup) onHighlightGroup(g.name, g.switches.map((s) => s.id));
                            onClose();
                          }}
                          title="Display only this group on the screen"
                        >
                          👁️ View Group on Screen
                        </button>
                        <button
                          className="btn-group-action edit"
                          onClick={() => startEditGroup(g)}
                          title="Edit group name or switches"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn-group-action delete"
                          onClick={() => handleDelete(g.name)}
                          title="Delete group"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ================= Group Editor ================= */
            <form onSubmit={handleSave} className="group-editor-view">
              {formError && <div className="form-error-banner">{formError}</div>}

              {/* Group Name & Stats Bar */}
              <div className="editor-top-bar">
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label htmlFor="group-name-input">
                    Group Name <span style={{ color: 'var(--critical)' }}>*</span>
                  </label>
                  <input
                    id="group-name-input"
                    type="text"
                    required
                    placeholder="e.g. Critical-HVAC, East-Wing-Backbone, Core-Sync..."
                    value={groupName}
                    onChange={e => { setGroupName(e.target.value); setFormError(''); }}
                    style={{ fontSize: '1rem', fontWeight: 600 }}
                  />
                </div>

                <div className="selection-stats-box">
                  <div className="stat-item">
                    <span className="stat-label">Switches</span>
                    <strong className="stat-val">{selectedSwitchIds.size}</strong>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Buildings</span>
                    <strong className="stat-val">{selectedBuildingsCount}</strong>
                  </div>
                  {selectedSwitchIds.size > 0 && (
                    <button
                      type="button"
                      className="btn-clear-selection"
                      onClick={() => setSelectedSwitchIds(new Set())}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Switches Quick Pill Rack */}
              {selectedSwitchIds.size > 0 && (
                <div className="selected-pills-bar">
                  <div className="pills-bar-header">
                    <span className="pills-title">Selected Member Switches ({selectedSwitchIds.size}):</span>
                    {selectedSwitchIds.size > 8 && (
                      <button
                        type="button"
                        className="btn-toggle-pills"
                        onClick={() => setIsPillsExpanded(p => !p)}
                      >
                        {isPillsExpanded ? '▲ Show less' : `▼ Show all (${selectedSwitchIds.size})`}
                      </button>
                    )}
                  </div>
                  <div className={`pills-rack ${isPillsExpanded ? 'expanded' : ''}`}>
                    {Array.from(selectedSwitchIds).map(id => {
                      const sw = data?.nodesById.get(id);
                      return (
                        <span key={id} className="selected-sw-pill">
                          <span className="sw-pill-name">{sw?.name || id}</span>
                          <span className="sw-pill-bldg">({sw?.building || 'Unknown'})</span>
                          <button
                            type="button"
                            className="sw-pill-remove"
                            onClick={() => toggleSwitch(id)}
                            title="Remove from group"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Multi-building Switch Browser Header & Controls */}
              <div className="switch-browser-header">
                <div className="browser-title-row">
                  <h3>Select Switches:</h3>
                  <div className="switch-filter-pills">
                    <button
                      type="button"
                      className={`filter-pill-btn ${switchFilterMode === 'ALL' ? 'active' : ''}`}
                      onClick={() => setSwitchFilterMode('ALL')}
                    >
                      All Switches
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${switchFilterMode === 'SELECTED' ? 'active' : ''}`}
                      onClick={() => setSwitchFilterMode('SELECTED')}
                    >
                      Selected ({selectedSwitchIds.size})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${switchFilterMode === 'UNSELECTED' ? 'active' : ''}`}
                      onClick={() => setSwitchFilterMode('UNSELECTED')}
                    >
                      Unselected
                    </button>
                  </div>
                </div>

                <div className="browser-controls-row">
                  <div className="accordion-expand-controls">
                    <button
                      type="button"
                      className="btn-text-action"
                      onClick={expandAllBuildings}
                      title="Expand all building lists"
                    >
                      ▼ Expand All
                    </button>
                    <span className="control-sep">·</span>
                    <button
                      type="button"
                      className="btn-text-action"
                      onClick={collapseAllBuildings}
                      title="Collapse all building lists"
                    >
                      ▲ Collapse All
                    </button>
                  </div>

                  <div className="browser-search-group">
                    <select
                      value={siteFilter}
                      onChange={e => setSiteFilter(e.target.value)}
                      className="site-select"
                      title="Filter by data center site"
                    >
                      {availableSites.map(s => (
                        <option key={s} value={s}>{s === 'ALL' ? 'All Data Centers / Sites' : s}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Search switch name, ID, IP, or building..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="search-switches-input"
                    />
                  </div>
                </div>
              </div>

              <div className="buildings-accordion-list">
                {buildingsWithSwitches.length === 0 ? (
                  <div className="no-matches">
                    No switches matching active filters {searchQuery ? `("${searchQuery}")` : ''}.
                  </div>
                ) : (
                  buildingsWithSwitches.map(({ building: b, switches, totalInBuilding }) => {
                    const isCollapsed = collapsedBuildings.has(b.id);
                    const selectedInThisBldg = switches.filter(s => selectedSwitchIds.has(s.id)).length;
                    const allSelectedInBldg = switches.length > 0 && selectedInThisBldg === switches.length;

                    return (
                      <div key={b.id} className="building-accordion-item">
                        <div className="building-accordion-header">
                          <button
                            type="button"
                            className="bldg-toggle-btn"
                            onClick={() => toggleCollapse(b.id)}
                          >
                            <span className="collapse-arrow">{isCollapsed ? '▶' : '▼'}</span>
                            <span className="bldg-name">{b.name}</span>
                            <span className="bldg-site">{b.site}</span>
                          </button>

                          <div className="bldg-header-actions">
                            <span className={`bldg-selection-badge ${selectedInThisBldg > 0 ? 'has-selected' : ''}`}>
                              {selectedInThisBldg} / {totalInBuilding} selected
                            </span>
                            <button
                              type="button"
                              className="btn-select-bldg"
                              onClick={() => allSelectedInBldg ? deselectAllInBuilding(switches) : selectAllInBuilding(switches)}
                            >
                              {allSelectedInBldg ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="building-switches-grid">
                            {switches.map(sw => {
                              const isChecked = selectedSwitchIds.has(sw.id);
                              const otherGroups = (sw.groups || []).filter(g => g !== originalGroupName);

                              return (
                                <div
                                  key={sw.id}
                                  className={`switch-select-card ${isChecked ? 'selected' : ''}`}
                                  onClick={() => toggleSwitch(sw.id)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // handled by parent onClick
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span
                                    className="status-dot"
                                    style={{ backgroundColor: statusColor(sw.status) }}
                                    title={sw.status}
                                  />
                                  <div className="switch-card-info">
                                    <div className="sw-id-name">
                                      <strong>{sw.name}</strong>
                                      <span className="sw-id-sub">({sw.id})</span>
                                    </div>
                                    <div className="sw-meta-row">
                                      <span>{sw.ipAddress}</span>
                                      {otherGroups.length > 0 && (
                                        <span className="other-groups-indicator" title={otherGroups.join(', ')}>
                                          +{otherGroups.length} group{otherGroups.length === 1 ? '' : 's'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Editor Footer Actions */}
              <div className="editor-footer">
                {originalGroupName && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDelete(originalGroupName)}
                  >
                    Delete Group
                  </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => { setViewMode('list'); setFormError(''); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!groupName.trim() || selectedSwitchIds.size === 0}
                  >
                    {originalGroupName ? 'Save Changes' : 'Create Group'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
