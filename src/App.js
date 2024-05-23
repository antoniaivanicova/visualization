import './App.css';
import { useEffect, useState } from 'react';
import { Graph } from 'react-d3-graph';
import neo4j from 'neo4j-driver';
import * as d3Force from 'd3-force';
import * as d3 from 'd3';

const MyGraphComponent = ({ query }) => {
  const driver = neo4j.driver(
      'bolt://localhost:7687',
      neo4j.auth.basic('neo4j', 'node1234')
  );

  const fetchGraphData = async (query) => {
    const session = driver.session();
    try {
      const result = await session.run(query);
      const nodesMap = new Map();
      const links = [];
      const levels = new Map();

      result.records.forEach((record) => {
        const sourceNode = record.get('n').properties;
        const sourceName = record.get('n').properties.name;

        if (record.has('m')) {
          const targetNode = record.get('m').properties;
          const targetName = record.get('m').properties.name;
          const relationship = record.get('r');

          if (!levels.has(sourceName)) {
            levels.set(sourceName, 0);
          }

          if (!levels.has(targetName)) {
            levels.set(targetName, levels.get(sourceName) + 1);
          }

          nodesMap.set(sourceName, { id: sourceName, level: levels.get(sourceName), ...sourceNode });
          nodesMap.set(targetName, { id: targetName, level: levels.get(targetName), ...targetNode });

          links.push({
            source: sourceName,
            target: targetName,
            label: relationship.type
          });
        } else {
          if (!levels.has(sourceName)) {
            levels.set(sourceName, 0);
          }
          nodesMap.set(sourceName, { id: sourceName, level: levels.get(sourceName), ...sourceNode });
        }
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
      const graphData = await fetchGraphData(query);
      setData(graphData);
    };
    getData();
  }, [query]);

  const getCustomLayout = () => {
    const layout = d3Force.forceSimulation()
        .force('charge', d3Force.forceManyBody().strength(d => {
          if (d.level === 'L1') {
            return -300;
          } else if (d.level === 'L2') {
            return -200;
          } else {
            return -600;
          }
        }))
        .force('center', d3Force.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force('link', d3Force.forceLink().id(d => d.id).distance(200))
        .force('collide', d3Force.forceCollide().radius(50))
        .force('cluster', (alpha) => {
          data.nodes.forEach(node => {
            if (node.level === 'L2') {
              const parent = data.nodes.find(n => n.id === node.parentId);
              if (parent) {
                node.vx += (parent.x - node.x) * 0.1 * alpha;
                node.vy += (parent.y - node.y) * 0.1 * alpha;
              }
            }
          });
        });

    return layout;
  };

  const myConfig = {
    nodeHighlightBehavior: true,
    node: {
      color: 'lightblue',
      size: 120,
      highlightStrokeColor: 'blue'
    },
    link: {
      highlightColor: 'darkblue',
      //renderLabel: true,
      labelProperty: 'label',
      strokeWidth: 1
    },
    d3: {
      gravity: -100,
      linkLength: 50,
      forceSimulation: getCustomLayout()
    }
  };

  const customLink = (link) => {
    const { source, target } = link;
    const path = d3.path();
    const controlPointX = (source.x + target.x) / 2;
    const controlPointY = (source.y + target.y) / 2 - 10; // Adjust this value to control the curvature
    path.moveTo(source.x, source.y);
    path.quadraticCurveTo(controlPointX, controlPointY, target.x, target.y);

    return (
        <path
            key={`link-${link.source.id}-${link.target.id}`}
            d={path.toString()}
            fill="none"
            stroke="lightblue"
            strokeWidth={2}
        />
    );
  };

  return (
      <div>
        <Graph
            id="graph-id"
            data={data}
            config={myConfig}
            customLink={customLink}
        />
      </div>
  );
};

function App() {
  const defaultQuery = 'MATCH (n)-[r]->(m) RETURN n, r, m';
  const [query, setQuery] = useState(defaultQuery);
  const [inputQuery, setInputQuery] = useState(defaultQuery);

  const handleInputChange = (event) => {
    setInputQuery(event.target.value);
  };

  const handleButtonClick = () => {
    setQuery(inputQuery);
  };

  const handleReturnClick = () => {
    setInputQuery(defaultQuery);
    setQuery(defaultQuery);
  };

  return (
      <div>
        <input
            type="text"
            value={inputQuery}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '10px', fontSize: '16px' }}
        />
        <button onClick={handleButtonClick} style={{ padding: '10px 20px', fontSize: '16px', marginTop: '10px' }}>
          Run Query
        </button>
        <button onClick={handleReturnClick} style={{ padding: '10px 20px', fontSize: '16px', marginTop: '10px', marginLeft: '10px' }}>
          Return to Default Query
        </button>
        <MyGraphComponent query={query} />
      </div>
  );
}

export default App;
