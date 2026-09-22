const fs = require('fs');

console.log('Loading dataset...');
const data = require('./public/network-topology-dataset.json');

console.log('Reading new CSV...');
const csv = fs.readFileSync('./public/interfaces1.csv', 'utf8').split('\n');

const newInterfaces = [];
for (let i = 1; i < csv.length; i++) {
  const line = csv[i].trim();
  if (!line) continue;
  
  // interface_id,node_id,name,status,created_At,updated_At
  const cols = line.split(',');
  if (cols.length < 4) continue;
  
  const ifaceId = cols[0];
  const nodeIdRaw = cols[1]; // e.g. NODE000001
  const name = cols[2];
  const status = cols[3].toLowerCase(); // e.g. down, up
  
  // Map NODE000001 to actual node ID
  const numMatch = nodeIdRaw.match(/\d+/);
  if (!numMatch) continue;
  const idx = parseInt(numMatch[0], 10) - 1;
  
  const actualNode = data.nodes[idx];
  if (!actualNode) continue;
  
  newInterfaces.push({
    interface_id: ifaceId,
    node_id: actualNode.id,
    name: name,
    status: status
  });
}

console.log(`Parsed ${newInterfaces.length} interfaces from CSV.`);
data.interfaces = newInterfaces;

fs.writeFileSync('./public/network-topology-dataset.json', JSON.stringify(data, null, 2));
console.log('Successfully updated network-topology-dataset.json!');
