# Network Topology JSON Data Guide

This application allows you to load custom network topologies either as **4 separate JSON files** or **1 bundled JSON file**. Below are the expected formats and parameters for each data type.

## 1. Nodes (`nodes.json`)
The nodes array defines the core devices in your network (Switches, Routers, etc.).

```json
[
  {
    "id": "S-001",                   // REQUIRED: Unique identifier for the node
    "name": "Core-Router-Alpha",     // REQUIRED: Display name
    "type": "router",                // "router" | "switch"
    "tier": "core",                  // "access" | "distribution" | "core"
    "status": "up",                  // "up" | "down" | "connecting"
    "severity": "normal",            // "normal" | "warning" | "minor" | "major" | "critical"
    "building": "Data Center 1",     // Optional: The building this node is located in
    "location": "New York",          // Optional: Geographic location or site
    "ipAddress": "10.0.0.1",         // Optional: IP Address
    "groups": ["Campus-Core"]        // Optional: Array of group names this node belongs to
  }
]
```

## 2. Interfaces (`interfaces.json`) (Optional)
The interfaces array defines the physical or logical ports on your nodes.

```json
[
  {
    "interface_id": "IF-S001-1",     // REQUIRED: Unique identifier for the interface
    "node_id": "S-001",              // REQUIRED: The ID of the node this interface belongs to
    "name": "TenGigE0/0/0/1",        // REQUIRED: Display name of the interface
    "status": "up",                  // "up" | "down" | "admin down"
    "mac_address": "00:1A:2B...",    // Optional: MAC Address
    "ip_address": "10.0.0.1/30"      // Optional: IP Address assigned to interface
  }
]
```

## 3. Links (`links.json`) (Optional)
The links array defines the connections between nodes or specific interfaces.

```json
[
  {
    "link_id": "L-101",                  // REQUIRED: Unique identifier for the link
    "source": "S-001",                   // REQUIRED: The ID of the source Node
    "target": "S-002",                   // REQUIRED: The ID of the target Node
    "bandwidth_mbps": 10000,             // REQUIRED: Link capacity in Mbps
    "status": "up",                      // "up" | "down"
    "source_interface_id": "IF-S001-1",  // Optional: The specific interface ID on the source node
    "target_interface_id": "IF-S002-4"   // Optional: The specific interface ID on the target node
  }
]
```

## 4. Alarms (`alarms.json`) (Optional)
The alarms array defines active alerts affecting nodes, interfaces, or links.

```json
[
  {
    "alarm_id": "ALM-9912",              // REQUIRED: Unique alarm ID
    "entity_id": "S-001",                // REQUIRED: The ID of the Node, Interface, or Link this affects
    "severity": "critical",              // "warning" | "minor" | "major" | "critical"
    "message": "Power supply failure",   // REQUIRED: Human readable description
    "timestamp": "2026-09-30T10:00:00Z"  // Optional: ISO 8601 Timestamp
  }
]
```

## Bundled Format
If you choose the "1 Combined Bundle" option in the UI, your JSON file should simply be an object containing these four arrays as keys:

```json
{
  "nodes": [ ... ],
  "interfaces": [ ... ],
  "links": [ ... ],
  "alarms": [ ... ]
}
```
