import { KIND_GLYPH } from '../utils/graph.js';

/**
 * Network Topology  >  DC1 Building A  >  Switch-0025
 *
 * Always shows which level the user is currently looking at, and every
 * ancestor crumb is clickable to get back up.
 */
export default function Breadcrumbs({ building, node, onGoGlobal, onGoBuilding }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button type="button" className={building ? 'crumb link' : 'crumb current'} onClick={onGoGlobal}>
        Network Topology
      </button>

      {building && (
        <>
          <span className="crumb-sep">›</span>
          <button
            type="button"
            className={node ? 'crumb link' : 'crumb current'}
            onClick={() => onGoBuilding(building.id)}
          >
            <span className="glyph">{KIND_GLYPH.building}</span>
            {building.name}
          </button>
        </>
      )}

      {building && node && (
        <>
          <span className="crumb-sep">›</span>
          <span className="crumb current">
            <span className="glyph">{node.type === 'switch' ? KIND_GLYPH.switch : KIND_GLYPH.router}</span>
            {node.name}
          </span>
        </>
      )}

      {building && (
        <button type="button" className="back-btn" onClick={onGoGlobal}>
          ← Back to Network
        </button>
      )}
    </nav>
  );
}
