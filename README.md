# Network Topology

An enterprise network management dashboard for ~1,500 devices, built with React + Vite and
[Reagraph](https://reagraph.dev) for the topology rendering.

```
npm install
npm run dev        # start the dev server
npm run build      # production build
npm run validate   # data-integrity checks (see below)
npm run lint       # oxlint
```

## The data model

`public/network-topology-dataset.json` is the source of truth and has four sections:

| section      | count | what it is                                            |
| ------------ | ----- | ----------------------------------------------------- |
| `nodes`      | 1,500 | the actual network devices — **routers + switches only** |
| `interfaces` | 4,751 | supporting data; never rendered as graph nodes         |
| `links`      | 1,761 | connect devices *through their interfaces*             |
| `alarms`     | 488   | attached to a device by `nodeId`                       |

The 1,500 devices break down as 10 core routers, 140 distribution routers and 1,350 access
switches. Each node in `nodes` includes:
- `id`: unique identifier (e.g. `S-0001`, `R-0001`)
- `name`: device name
- `type`: `switch` or `router`
- `status`: connection status (`connected`, `down`, `connecting`)
- `severity`: health severity (`normal`, `warning`, `minor`, `major`, `critical`)
- `ipAddress`: IP address
- `location`: physical campus site (e.g. `Data Center 1`)
- `tier`: `access`, `distribution`, or `core`
- `building`: the building to which the device belongs (e.g. `DC4 Building F` for switches, `null` for routers)
- `groups`: dynamic array of strings (`string[]`) keeping track of custom groups the node belongs to (e.g. `["Core-Campus-Sync", "Critical-HVAC-Monitoring"]`)

A link references interfaces, not devices, so it is resolved like this:

```
IF-00031 -> R-0001
IF-00065 -> S-0008
LNK-00001 (IF-00031 <-> IF-00065)   =>   R-0001 <-> S-0008
```

`useTopologyData` does that resolution once and exposes `resolvedLinks`, `linksByNode`,
`alarmsByNode`, `interfacesByNode`, `uplinkRoutersBySwitch` and `groups`.

## Multi-Building Switch Groups

Users can create and manage arbitrary groups combining selective switches from different buildings:
- **Many-to-Many Membership**: A switch can belong to multiple groups simultaneously (`groups: string[]`).
- **Group Manager**: Access via the **📁 Groups** button in the header to view, create, edit, or delete custom groups.
- **Cross-Building Selector**: Interactively pick switches across any number of buildings with per-building collapsible accordions, selective checkmarking, and search filtering.
- **Interactive Graph Highlighting**: Highlight all switches in a group across the entire estate with one click.
- **Filter & Search Integration**: Filter the topology view by group in the filter panel, or search directly for group names in the search bar.
- **Details Panel & Quick Assign**: View all groups assigned to a switch with interactive pills, quickly remove with `×`, or assign new groups via the node inspector or right-click context menu.

## Buildings are a visual layer, not devices

Drawing 1,500 nodes at once is unreadable, so the global view aggregates access switches into
**buildings**. This is a presentation concern only:

```
1,500 actual nodes   (public/network-topology-dataset.json with building & groups)
        |
building mapping     (src/data/buildingMapping.json + src/utils/buildingMapper.js)
        |
visual grouping      (src/utils/topologyTransform.js)
        |
Reagraph             (src/components/NetworkGraph.jsx)
```

A building is never added to `nodes`, never counted as a device, and never replaces a switch.
Open a building and all of its switches are there as individual nodes with their real links,
status, severity, interfaces, building, groups and alarms.

### Configuring the mapping

`src/data/buildingMapping.json` is a plain rule file — edit it by hand or replace it with a CMDB
export. Rules are evaluated top to bottom and the first building that accepts a switch owns it.
Matchers (all optional, OR'd together):

| matcher         | example                                       |
| --------------- | --------------------------------------------- |
| `switchIds`     | `["S-0001", "S-0002"]`                        |
| `switchRanges`  | `[{ "from": "S-0001", "to": "S-0030" }]`      |
| `uplinkRouters` | `["R-0011"]` — switches uplinking into these  |
| `locations`     | `["Data Center 1"]` — constrains the above    |

Per-building extras: `floorCount` (switches are chunked deterministically across floors) or an
explicit `floors: [{ id, name, switchIds }]` plan.

Any switch no rule claims is placed in an auto-generated "Unassigned" building for its site, so a
mapping mistake can never make a device disappear.

The shipped default was generated from the real cabling — a building is the set of switches
sharing a group of uplink distribution routers within one site — which is what keeps the global
graph a clean tree instead of a mesh. Regenerate it with:

```
npm run generate:buildings
```

## The two views

**Global** — core routers, then distribution routers, then buildings. Each building sits in its
own column with its uplink routers stacked directly above it, and core routers that serve a single
site sit above that site (the rest form a backbone band). Switch links are aggregated onto their
building, so one line carries "30 links, 2 down" instead of thirty crossing lines. Nothing is
dropped: links between two switches in the same building are counted on the building and drawn in
the building view.

**Building** — every switch in that building, individually, laid out floor by floor, with its real
links, its uplink routers, and any switch in another building it genuinely connects to.

Breadcrumbs (`Network Topology › DC3 Building D › Switch-0025`) and "← Back to Network" track the
level you are on. The **Buildings** tab in the header swaps the graph for a health card grid.

Building colour is a proportional roll-up (`buildingHealthLevel` in `src/utils/graph.js`) rather
than the literal worst severity — with 50+ switches per building almost every building contains a
critical device, so worst-severity would paint the whole map red. The literal worst severity and
all the underlying counts are shown in the details panel.

## Search

Matches router/switch IDs and names, IP addresses, building names, sites and floors. Results are
typed (🏢 building, 🔀 switch, 🌐 router). Picking a switch navigates into its building, centres
the camera on it and opens its details — it never creates a duplicate node for the search hit.

## Validating the data

`npm run validate` runs the real mapper and the real transforms against the real dataset and
asserts the invariants that matter:

- `nodes.length === 1500`, and routers + switches === 1500
- every link resolves; interfaces are never nodes
- every switch is mapped to exactly one building and one floor; no switch is mapped twice
- no building leaked into the node dataset and no router was put in a building
- every real link is accounted for (aggregated edge or intra-building)
- every mapped switch appears in its building view (1,350 / 1,350)
- per-building health numbers sum to the building's switch count
- every device and building is reachable from search

The app also logs `Actual network devices: 1500` on load and shows a banner if the count ever
drifts from `meta.nodeCount`.

## Layout of the source

```
src/
  components/
    NetworkGraph.jsx     Reagraph renderer (both views)
    BuildingView.jsx     building health cards
    DetailsPanel.jsx     device + building inspector
    SearchBar.jsx        typed search
    Breadcrumbs.jsx      level navigation
    Legend.jsx           severity legend
    Chrome.jsx           header, zoom controls, context menu, toast
    TopologyCanvas.jsx   previous canvas/D3 renderer, kept for reference
  hooks/
    useTopologyData.js   dataset fetch + derived indexes + validation
    useBuildingMapping.js applies the mapping config
  utils/
    graph.js             colours, severity helpers, formatting
    buildingMapper.js    rule evaluation -> buildings/floors
    topologyTransform.js global + building graphs, health aggregation
  data/
    buildingMapping.json the configurable mapping
scripts/
  generateBuildingMapping.mjs
  validateTopology.mjs
```

`TopologyCanvas.jsx` is the original hand-rolled canvas renderer. It is no longer wired up — the
Reagraph component replaced it — but it is kept in the tree for reference.
