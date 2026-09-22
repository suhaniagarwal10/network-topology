import { useState } from 'react';
import Papa from 'papaparse';

export default function ImportWorkflow({ onLoadFromRaw, onLoadDemo }) {
  const [nodesFile, setNodesFile] = useState(null);
  const [linksFile, setLinksFile] = useState(null);
  const [interfacesFile, setInterfacesFile] = useState(null);
  const [alarmsFile, setAlarmsFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);

  const parseCsv = (file) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err),
      });
    });
  };

  const handleImport = async () => {
    if (!nodesFile || !linksFile || !interfacesFile || !alarmsFile) {
      setError('Please provide all 4 CSV files before proceeding.');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const [nodes, links, interfaces, alarms] = await Promise.all([
        parseCsv(nodesFile),
        parseCsv(linksFile),
        parseCsv(interfacesFile),
        parseCsv(alarmsFile)
      ]);
      
      onLoadFromRaw({ nodes, links, interfaces, alarms });
    } catch (err) {
      setError('Failed to parse CSV files: ' + err.message);
      setParsing(false);
    }
  };

  return (
    <div className="import-workflow">
      <div className="import-card">
        <h1>Import Topology Data</h1>
        <p>Please upload the required CSV files to construct your network topology.</p>
        
        {error && <div className="import-error">{error}</div>}

        <div className="import-steps">
          <div className="import-step">
            <label>1. Nodes CSV</label>
            <input type="file" accept=".csv" onChange={(e) => setNodesFile(e.target.files[0])} />
          </div>
          <div className="import-step">
            <label>2. Links CSV</label>
            <input type="file" accept=".csv" onChange={(e) => setLinksFile(e.target.files[0])} />
          </div>
          <div className="import-step">
            <label>3. Interfaces CSV</label>
            <input type="file" accept=".csv" onChange={(e) => setInterfacesFile(e.target.files[0])} />
          </div>
          <div className="import-step">
            <label>4. Alarms CSV</label>
            <input type="file" accept=".csv" onChange={(e) => setAlarmsFile(e.target.files[0])} />
          </div>
        </div>

        <div className="import-actions">
          <button className="import-btn" onClick={handleImport} disabled={parsing}>
            {parsing ? 'Parsing...' : 'Load Topology'}
          </button>
          
          <div className="import-divider">OR</div>
          
          <button className="demo-btn" onClick={onLoadDemo} disabled={parsing}>
            Load Demo Dataset (1,500 Nodes)
          </button>
        </div>
      </div>
    </div>
  );
}
