import { useState, useEffect } from 'react';

export default function HelpModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('navigation');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'navigation', label: '🧭 Views & Navigation' },
    { id: 'canvas', label: '🖱️ Canvas & Dragging' },
    { id: 'groups', label: '📁 Switch Groups' },
    { id: 'standalone', label: '📦 Standalone & Alarms' },
    { id: 'shortcuts', label: '⌨️ Shortcuts & Tips' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content help-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '94%',
          maxWidth: 880,
          height: '84vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#111827',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.4)',
              }}
            >
              ?
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                Network Topology Guide &amp; Help
              </h2>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Quick reference for navigating the hierarchy, canvas controls, group management, and device actions
              </div>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
              borderRadius: 4,
            }}
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 20px',
            borderBottom: '1px solid #1e293b',
            background: '#0b1324',
            overflowX: 'auto',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : '#94a3b8',
                fontWeight: activeTab === tab.id ? '600' : 'normal',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
          {activeTab === 'navigation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HelpCard
                icon="🌐"
                title="Enterprise Global Overview"
                content="The default view visualizes the entire estate hierarchy: 10 Core backbone routers at the top, 140 Distribution routers clustered per site/building, 30 Buildings containing 1,350 access switches, and isolated Standalone perimeter nodes."
              />
              <HelpCard
                icon="🏢"
                title="Building Drill-Down"
                content="Double-click any building node (or pick it from the Search bar / Buildings cards) to step inside. The building view lays out every mapped switch floor-by-floor from top to bottom, alongside the distribution routers it uplinks into and inter-building connection links."
              />
              <HelpCard
                icon="📁"
                title="Dedicated Group View"
                content="Click on any group badge in the Groups Manager or right-hand Details Panel to enter an isolated Group View. Only the selective switches belonging to that group are drawn on screen. Use the '+ Switches Only' / '✓ With Uplinks' toggle in the top badge to reveal or hide uplink distribution routers."
              />
              <HelpCard
                icon="🗂️"
                title="Buildings Cards vs. 3D Topology"
                content="In the Global Overview, use the 'Topology' / 'Buildings' tabs in the header to switch between the 3D Reagraph network diagram and a high-density card grid summarizing health, down devices, and alarms for all 30 buildings."
              />
              <HelpCard
                icon="📂"
                title="Custom Topology Import (JSON Files)"
                content="Click '📂 Load Data' in the top bar to import your own network inventory. You can upload 4 separate JSON files (nodes.json, interfaces.json, links.json, alarms.json) or a single combined bundle. A 20-device test dataset is pre-packaged in test-data/ and can be loaded with one click. You can restore the default 1,500-device topology at any time."
              />
            </div>
          )}

          {activeTab === 'canvas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HelpCard
                icon="🖱️"
                title="Zero-Latency Node Drag-and-Drop"
                content="Click and drag any node (core router, distribution router, building, access switch, or standalone node) to reposition it anywhere on the canvas. Dragging updates smoothly at 60+ FPS with zero lag, and positions are preserved during your session."
              />
              <HelpCard
                icon="✋"
                title="Panning the Canvas"
                content="Click and drag on any empty region of the canvas background to pan the camera view in any direction."
              />
              <HelpCard
                icon="🔍"
                title="Zooming and Screen Fit"
                content="Use your mouse wheel / trackpad pinch to zoom in and out smoothly. You can also use the bottom-right Zoom Controls (+ for Zoom In, − for Zoom Out, and ◻ to automatically fit all nodes into view)."
              />
              <HelpCard
                icon="💡"
                title="Hover Snapshots & Neighbor Lighting"
                content="Hovering over any node displays a quick hover chip with its name, IP, status, and location. Reagraph automatically illuminates neighboring devices and connecting links while gently dimming unrelated parts of the estate."
              />
              <HelpCard
                icon="⚡"
                title="Right-Click Context Menu"
                content="Right-click on any device to open its context menu: Quick Monitor, Highlight Neighbors, Open Building, Manage Groups, View Interfaces, View Links, Edit Device, or Delete Device."
              />
            </div>
          )}

          {activeTab === 'groups' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HelpCard
                icon="📁"
                title="Custom Switch Groups"
                content="Click the purple '📁 Groups' button in the top bar to open the Group Manager. You can create custom groups consisting of selective switches chosen across multiple different buildings."
              />
              <HelpCard
                icon="🏷️"
                title="Multi-Group Membership"
                content="Any single switch can belong to multiple groups simultaneously. All groups a switch belongs to are dynamically tracked in the data model and displayed as clickable tags in the right Details Panel."
              />
              <HelpCard
                icon="🔀"
                title="Switch Selection &amp; Accordion Filters"
                content="In the Group Editor, expand any building accordion to view its switches in a scrollable grid. Use the switch filters ('All', 'Selected only', 'Unselected only') and 'Expand All / Collapse All' buttons to easily manage large selections."
              />
              <HelpCard
                icon="⚡"
                title="Quick Assign from Details Panel"
                content="Click '+ Manage Groups' under the Groups section in the right Details Panel (or right-click a switch) to quickly assign or unassign group tags without opening the full Group Manager."
              />
              <HelpCard
                icon="🔄"
                title="Instant Live Updates"
                content="Adding, modifying, or deleting a group updates the 'All Groups' list instantly inside the Groups window without needing to close and reopen."
              />
            </div>
          )}

          {activeTab === 'standalone' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HelpCard
                icon="📦"
                title="Standalone Unlinked Nodes"
                content="Both the Global Overview and Building views include isolated, standalone devices (degree 0 with zero links), such as air-gapped perimeter security gateways, cold standby disaster recovery units, and lab testbed switches. They can be freely dragged, inspected, and searched."
              />
              <HelpCard
                icon="🚨"
                title="Alarms &amp; Severity Levels"
                content="Nodes and buildings are colored by their health/severity: Normal (green), Warning/Minor (yellow), Major (orange), and Critical (red). Click 'Active alarms' in the header to open the full alarm history modal, or click 'Simulate Alarm' to test dynamic alarm alerts."
              />
              <HelpCard
                icon="🔗"
                title="Link Bundles &amp; Status"
                content="Connecting lines represent physical or aggregated link bundles. Click any link to view its bundled link count, degraded status, and aggregated bandwidth in Mbps."
              />
              <HelpCard
                icon="🗑️"
                title="Trash &amp; Node Recovery"
                content="Deleting a node safely cascades its links and interfaces and moves it to the Trash. Click 'Trash (N)' in the top bar to restore any deleted node along with its connections."
              />
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.88rem',
                  lineHeight: 1.6,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                    <th style={{ padding: '8px 12px' }}>Action / Gesture</th>
                    <th style={{ padding: '8px 12px' }}>Shortcut / How-To</th>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <ShortcutRow
                    action="Drag Node"
                    shortcut="Left Click + Drag on Node"
                    description="Reposition any node smoothly across the canvas"
                  />
                  <ShortcutRow
                    action="Pan Canvas"
                    shortcut="Left Click + Drag on Background"
                    description="Move the camera perspective"
                  />
                  <ShortcutRow
                    action="Zoom In / Out"
                    shortcut="Mouse Wheel / Trackpad Pinch"
                    description="Zoom camera closer or further away"
                  />
                  <ShortcutRow
                    action="Fit to Screen"
                    shortcut="Click ◻ in bottom-right"
                    description="Auto-centers and fits all graph nodes in view"
                  />
                  <ShortcutRow
                    action="Drill into Building"
                    shortcut="Double-Click on Building Node"
                    description="Enters building view showing switches & floors"
                  />
                  <ShortcutRow
                    action="Open Details"
                    shortcut="Left Click on any Node / Link"
                    description="Opens full metadata in right-hand inspector"
                  />
                  <ShortcutRow
                    action="Context Actions"
                    shortcut="Right-Click on any Node"
                    description="Opens quick actions menu (Monitor, Groups, Edit)"
                  />
                  <ShortcutRow
                    action="Search Everything"
                    shortcut="Click Search Bar or type"
                    description="Searches routers, switches, buildings, IPs, and groups"
                  />
                  <ShortcutRow
                    action="Close Modal"
                    shortcut="Esc or Click outside"
                    description="Quickly dismisses any dialog or modal"
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            background: '#111827',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#64748b',
          }}
        >
          <span>Tip: Hover over any switch in the Groups window or Details panel to view its full details.</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpCard({ icon, title, content }) {
  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          fontSize: '1.5rem',
          lineHeight: 1,
          flexShrink: 0,
          background: 'rgba(255, 255, 255, 0.05)',
          padding: 8,
          borderRadius: 6,
        }}
      >
        {icon}
      </div>
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.96rem', color: '#f1f5f9' }}>{title}</h4>
        <p style={{ margin: 0, fontSize: '0.86rem', color: '#cbd5e1', lineHeight: 1.55 }}>{content}</p>
      </div>
    </div>
  );
}

function ShortcutRow({ action, shortcut, description }) {
  return (
    <tr style={{ borderBottom: '1px solid #1e293b' }}>
      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#e2e8f0' }}>{action}</td>
      <td style={{ padding: '10px 12px' }}>
        <code
          style={{
            background: '#020617',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid #334155',
            color: '#38bdf8',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
          }}
        >
          {shortcut}
        </code>
      </td>
      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{description}</td>
    </tr>
  );
}
