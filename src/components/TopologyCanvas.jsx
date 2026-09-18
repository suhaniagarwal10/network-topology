import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { SEV_COLOR, bwLabel } from '../utils/graph';

// Below these zoom levels we stop drawing text — with 1,500 nodes on screen
// at once there's no room to render labels anyway, and skipping the
// ctx.fillText calls when they're illegible is what keeps panning smooth.
const LABEL_MIN_SCALE = 1.6;
const LINK_LABEL_MIN_SCALE = 3.2;

/**
 * Renders the topology onto a single <canvas>. Deliberately NOT one DOM
 * element per node (1,500+ nodes would make React/DOM diffing the
 * bottleneck) — this component owns its own draw loop and only talks to
 * React via the imperative handle (focusOnNode/zoomBy/fit) and the
 * onSelect/onHover callbacks.
 */
const TopologyCanvas = forwardRef(function TopologyCanvas(
  { data, selectedId, onSelect, onContextMenu, onHoverChange },
  ref
) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef(zoomIdentity);
  const zoomBehaviorRef = useRef(null);
  const didPanRef = useRef(false);
  const rafRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const nodeRadius = () => {
    const k = transformRef.current.k;
    return Math.max(2.2, Math.min(9, 4.5 * Math.sqrt(k) + 2));
  };

  const worldToScreen = (x, y) => transformRef.current.apply([x, y]);

  function hitTest(mx, my) {
    if (!data) return null;
    const nr = nodeRadius() * 1.7;
    let best = null;
    let bestD = nr * nr;
    for (const n of data.nodes) {
      const [x, y] = worldToScreen(n.x, n.y);
      const dx = x - mx, dy = y - my, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function requestDraw() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(); });
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wrapRef.current.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const k = transformRef.current.k;
    const nr = nodeRadius();
    const pad = 40;
    const showLabels = k > LABEL_MIN_SCALE;
    const showLinkLabels = k > LINK_LABEL_MIN_SCALE;

    const activeNode = data.nodesById.get(selectedId) || hovered;
    const highlightSet = activeNode
      ? new Set((data.linksByNode.get(activeNode.id) || []).map((l) => l.link_id))
      : null;

    // ---- links ----
    const linkMidpoints = [];
    for (const l of data.resolvedLinks) {
      const na = data.nodesById.get(l.a), nb = data.nodesById.get(l.b);
      const [x1, y1] = worldToScreen(na.x, na.y);
      const [x2, y2] = worldToScreen(nb.x, nb.y);
      if ((x1 < -pad && x2 < -pad) || (x1 > rect.width + pad && x2 > rect.width + pad) ||
          (y1 < -pad && y2 < -pad) || (y1 > rect.height + pad && y2 > rect.height + pad)) continue;
      const isHi = highlightSet && highlightSet.has(l.link_id);
      const isDown = l.status === 'down';
      if (isDown) {
        ctx.strokeStyle = isHi ? '#ff9d9d' : 'rgba(239,68,68,0.6)';
        ctx.setLineDash([5, 4]);
      } else {
        ctx.strokeStyle = isHi ? 'rgba(230,233,239,0.95)' : 'rgba(120,131,148,0.5)';
        ctx.setLineDash([]);
      }
      ctx.lineWidth = isHi ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (showLinkLabels) linkMidpoints.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, l, isDown });
    }
    ctx.setLineDash([]);

    if (showLinkLabels) {
      ctx.font = '10px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      for (const m of linkMidpoints) {
        ctx.fillStyle = m.isDown ? '#f38c8c' : '#9aa4b5';
        ctx.fillText(`${bwLabel(m.l.bandwidth_mbps)} \u00b7 ${m.l.status}`, m.x, m.y - 5);
      }
    }

    // ---- nodes ----
    for (const n of data.nodes) {
      const [x, y] = worldToScreen(n.x, n.y);
      if (x < -pad || x > rect.width + pad || y < -pad || y > rect.height + pad) continue;
      const color = SEV_COLOR[n.severity] || '#5b6472';
      const isSel = selectedId === n.id;
      const isHov = hovered && hovered.id === n.id;
      const size = isSel ? nr * 1.9 : isHov ? nr * 1.7 : nr;

      if (isSel || isHov) {
        ctx.save();
        ctx.shadowColor = isSel ? '#60a5fa' : color;
        ctx.shadowBlur = isSel ? 14 : 10;
      }

      ctx.beginPath();
      if (n.type === 'router') {
        // Diamond
        ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y);
        ctx.closePath();
      } else {
        // Rounded rectangle ("curved" square) for switches
        const w = size * 1.64, h = size * 1.64, rx = x - w / 2, ry = y - h / 2, radius = Math.min(size * 0.35, 6);
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, w, h, radius);
        } else {
          ctx.moveTo(rx + radius, ry);
          ctx.arcTo(rx + w, ry, rx + w, ry + h, radius);
          ctx.arcTo(rx + w, ry + h, rx, ry + h, radius);
          ctx.arcTo(rx, ry + h, rx, ry, radius);
          ctx.arcTo(rx, ry, rx + w, ry, radius);
          ctx.closePath();
        }
      }
      ctx.fillStyle = '#0b0f16';
      ctx.fill();
      ctx.lineWidth = isSel ? 2.6 : isHov ? 2.2 : n.status === 'down' ? 2.2 : 1.6;
      ctx.strokeStyle = isSel ? '#60a5fa' : color;
      ctx.stroke();

      if (isSel || isHov) ctx.restore();

      if (n.status === 'down' && size > 3) {
        ctx.strokeStyle = '#f4f6f9'; ctx.lineWidth = 1.5;
        const s2 = size * 0.45;
        ctx.beginPath();
        ctx.moveTo(x - s2, y - s2); ctx.lineTo(x + s2, y + s2);
        ctx.moveTo(x + s2, y - s2); ctx.lineTo(x - s2, y + s2);
        ctx.stroke();
      }

      const alarms = data.alarmsByNode.get(n.id);
      if (alarms && alarms.length && size > 3.5) {
        ctx.beginPath();
        ctx.arc(x + size * 0.9, y - size * 0.9, Math.max(4, size * 0.34), 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        if (size > 6) {
          ctx.fillStyle = '#0b0f16';
          ctx.font = 'bold 9px -apple-system,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(alarms.length), x + size * 0.9, y - size * 0.9 + 0.5);
          ctx.textBaseline = 'alphabetic';
        }
      }

      if (showLabels && size > 5) {
        ctx.textAlign = 'center';
        ctx.font = '600 11px -apple-system,sans-serif';
        ctx.fillStyle = '#e6e9ef';
        ctx.fillText(n.name, x, y + size + 14);
        ctx.font = '10px -apple-system,sans-serif';
        ctx.fillStyle = '#7c8797';
        ctx.fillText(n.ipAddress, x, y + size + 26);
      }
    }
  }

  // ---- fit-to-content helper, also used for the initial view ----
  function fitToNodes(nodeList, paddingFactor = 0.9) {
    if (!nodeList.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodeList) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    const w = Math.max(60, maxX - minX), h = Math.max(60, maxY - minY);
    const k = Math.min(rect.width / w, rect.height / h) * paddingFactor;
    const t = zoomIdentity
      .translate(rect.width / 2, rect.height / 2)
      .scale(k)
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    select(canvasRef.current).call(zoomBehaviorRef.current.transform, t);
  }

  useImperativeHandle(ref, () => ({
    fit: () => data && fitToNodes(data.nodes),
    focusOnNode: (node) => {
      if (!data) return;
      const conns = data.linksByNode.get(node.id) || [];
      const ids = new Set([node.id, ...conns.map((l) => (l.a === node.id ? l.b : l.a))]);
      fitToNodes([...ids].map((id) => data.nodesById.get(id)), 0.55);
    },
    zoomBy: (factor) => {
      select(canvasRef.current).transition().duration(150).call(zoomBehaviorRef.current.scaleBy, factor);
    },
  }));

  // ---- mount: size canvas, bind d3-zoom, attach listeners ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const selection = select(canvas);

    const zoomBehavior = d3zoom()
      .scaleExtent([0.02, 30])
      .on('start', () => { didPanRef.current = false; })
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        if (event.sourceEvent) didPanRef.current = true;
        requestDraw();
      });
    zoomBehaviorRef.current = zoomBehavior;
    selection.call(zoomBehavior);
    selection.on('dblclick.zoom', null); // avoid surprise double-click zoom while clicking nodes

    function resize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      requestDraw();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    function handleMove(e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      setHovered((prev) => (prev?.id === hit?.id ? prev : hit));
      setHoverPos(hit ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      if (onHoverChange) onHoverChange(hit);
      requestDraw();
    }
    function handleClick(e) {
      if (didPanRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      onSelect(hit);
    }
    function handleContext(e) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onContextMenu(hit, e.clientX, e.clientY);
    }

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', handleContext);
    return () => {
      ro.disconnect();
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('contextmenu', handleContext);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // fit the view once data first arrives
  useEffect(() => {
    if (data) fitToNodes(data.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestDraw(); }, [selectedId, hovered]);

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas ref={canvasRef} />
      {hovered && hoverPos && (
        <div className="tooltip" style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}>
          <b>{hovered.name}</b><br />
          <span className="ip">{hovered.ipAddress}</span><br />
          {hovered.status} &middot; {hovered.severity} &middot; {hovered.location}
        </div>
      )}
    </div>
  );
});

export default TopologyCanvas;
