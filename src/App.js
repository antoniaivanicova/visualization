import './App.css';
import { useEffect, useState } from 'react';
import { Graph } from 'react-d3-graph';
import neo4j from 'neo4j-driver';
import * as d3Force from 'd3-force';

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
          const thickness = relationship.properties.thickness?.low || relationship.properties.thickness;

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
            label: relationship.type,
            strokeWidth: thickness
          });
        } else {
          if (!levels.has(sourceName)) {
            levels.set(sourceName, 0);
          }
          nodesMap.set(sourceName, { id: sourceName, level: levels.get(sourceName), ...sourceNode });
        }
      });

      console.log(links)

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
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [visibleNodes, setVisibleNodes] = useState(new Set());

  useEffect(() => {
    const getData = async () => {
      const graphData = await fetchGraphData(query);
      setData(graphData);
    };
    getData();
  }, [query]);

  console.log(data.links)
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
        .force('link', d3Force.forceLink().id(d => d.id).distance(300))
        .force('collide', d3Force.forceCollide().radius(40))
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
    highlightOpacity: 0.2,
    collapsible: true,
    automaticRearrangeAfterDropNode: true,
    panAndZoom: false,
    highlightDegree: 2,
    linkHighlightBehavior: true,
    staticGraph: false,
    focusZoom: 1,
    maxZoom: 12,
    minZoom: 0.05,
    node: {
      //todo: change the colors of the nodes
      color: 'red',
      size: 120,
      highlightStrokeColor: 'black'
    },
    link: {
      type: "CURVE_SMOOTH",
      highlightColor: 'black',
      labelProperty: 'label',
      semanticStrokeWidth: true
    },
    d3: {
      gravity: -100,
      linkLength: 50,
      forceSimulation: getCustomLayout(),
    }
  };

  const fetchAncestorsQuery = async (nodeId) => {
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (n {name: $nodeId})<-[:PARENT*]-(ancestor)
        RETURN ancestor
      `, { nodeId });
      const ancestors = result.records.map(record => record.get('ancestor').properties.name);
      return ancestors;
    } finally {
      await session.close();
    }
  };

  const onClickNode = async (nodeId) => {
    const newExpandedNodes = new Set(expandedNodes);
    if (expandedNodes.has(nodeId)) {
      newExpandedNodes.delete(nodeId);
    } else {
      newExpandedNodes.add(nodeId);
    }
    setExpandedNodes(newExpandedNodes);

    const updatedVisibleNodes = new Set(visibleNodes);
    if (!visibleNodes.has(nodeId)) {
      updatedVisibleNodes.add(nodeId);
    }

    // Add ancestors of the clicked node to the visible nodes
    const ancestors = await fetchAncestorsQuery(nodeId);
    ancestors.forEach(ancestor => updatedVisibleNodes.add(ancestor));

    newExpandedNodes.forEach(expNode => {
      updatedVisibleNodes.add(expNode);
    });

    setVisibleNodes(updatedVisibleNodes);

    // Re-fetch the data including the children of the expanded nodes
    let expandedQuery = `
      MATCH (n)-[r]->(m)
      WHERE n.name IN [${Array.from(updatedVisibleNodes).map(n => `'${n}'`).join(', ')}]
         OR m.name IN [${Array.from(updatedVisibleNodes).map(n => `'${n}'`).join(', ')}]
      RETURN n, r, m
    `;

    const graphData = await fetchGraphData(expandedQuery);
    setData(graphData);
  };

  return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <Graph
            id="graph-id"
            data={data}
            config={myConfig}
            width={window.innerWidth}
            height={window.innerHeight}
            onClickNode={onClickNode}
            collapsible={true}
        />
      </div>
  );
};

function App() {
  const defaultQuery = 'MATCH (n:Document)-[r]->(m:L0) RETURN n, r, m';
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
      <div style={{ width: '100vw', height: '100vh' }}>
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
