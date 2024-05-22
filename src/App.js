import './App.css';
import { useEffect, useState } from 'react';
import { Graph } from 'react-d3-graph';
import neo4j from "neo4j-driver";

const MyGraphComponent = () => {

  const driver = neo4j.driver(
      'bolt://localhost:7687',
      neo4j.auth.basic('neo4j', 'node1234')
  );

  const fetchGraphData = async () => {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (n)-[r]->(m) RETURN n.name AS sourceName, n, r, m.name AS targetName, m');
      const nodesMap = new Map();
      const links = [];

      result.records.forEach(record => {
        const sourceNode = record.get('n').properties;
        const targetNode = record.get('m').properties;
        const sourceName = record.get('sourceName');
        const targetName = record.get('targetName');
        const relationship = record.get('r');

        if (!sourceName || !targetName) {
          console.warn('Node missing name property', sourceNode, targetNode);
          return;
        }

        nodesMap.set(sourceName, { id: sourceName, ...sourceNode });
        nodesMap.set(targetName, { id: targetName, ...targetNode });

        links.push({
          source: sourceName,
          target: targetName,
          label: relationship.type
        });
      });

      const nodes = Array.from(nodesMap.values());

      return { nodes, links };
    } catch (error) {
      console.error('Error fetching data from Neo4j', error);
      return { nodes: [], links: [] };
    } finally {
      await session.close();
    }
  };

  const [data, setData] = useState({ nodes: [], links: [] });

  useEffect(() => {
    const getData = async () => {
      const graphData = await fetchGraphData();
      setData(graphData);
    };
    getData();
  }, []);

  const myConfig = {
    nodeHighlightBehavior: true,
    node: {
      color: 'lightgreen',
      size: 120,
      highlightStrokeColor: 'blue'
    },
    link: {
      highlightColor: 'lightblue'
    }
  };

  return (
      <div>
        <Graph
            id="graph-id"
            data={data}
            config={myConfig}
        />
      </div>
  );
};

function App() {
  return (
    <div className="App">
     <MyGraphComponent/>
    </div>
  );
}

export default App;
