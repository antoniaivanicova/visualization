import './App.css';
import { useEffect, useState } from 'react';
import { Graph } from 'react-d3-graph';
import neo4j from "neo4j-driver";
import * as d3 from 'd3-force';

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
      console.log(graphData)
    };
    getData();
  }, []);

  const getCustomLayout = () => {
    const layout = d3.forceSimulation()
        .force("charge", d3.forceManyBody().strength(-200)) // Repulsive force between nodes
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2)) // Center the graph
        .force("link", d3.forceLink().id(d => d.id).distance(100)) // Distance between linked nodes
        .force("collide", d3.forceCollide().radius(50)); // Prevent node overlap

    return layout;
  };

  const myConfig = {
    nodeHighlightBehavior: true,
    node: {
      color: 'lightgreen',
      size: 120,
      highlightStrokeColor: 'blue'
    },
    link: {
      highlightColor: 'lightblue',
      //renderLabel: true,
      strokeWidth: 1 // Set the stroke width for all links
    },
    d3: {
      gravity: -100,
      linkLength: 50,
      forceSimulation: getCustomLayout()
    }
  };

  return (
      <div>
        <Graph
            id="graph-id" // id is mandatory
            data={data}
            config={myConfig}
            customLink={link => (
                <path
                    key={`link-${link.index}`}
                    d={`M${link.source.x},${link.source.y} Q${(link.source.x + link.target.x) / 2},${(link.source.y + link.target.y) / 2} ${link.target.x},${link.target.y}`}
                    fill="none"
                    stroke="lightblue"
                    strokeWidth={2}
                />
            )}
        />
      </div>
  );
};

function App() {
  return (
      <div>
        <MyGraphComponent/>
      </div>
  );
}

export default App;
