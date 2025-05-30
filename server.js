const express = require('express');
const cors = require('cors');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Enable CORS for local dev
const app = express();
app.use(cors());

// GraphQL schema for Sitecore JSS Layout Service
const schema = buildSchema(`
  type Query {
    layout(site: String!, routePath: String!, language: String!): LayoutResult
  }

  type LayoutResult {
    item: Item
    sitecore: SitecoreLayout
  }

  type Item {
    rendered: String
  }

  type SitecoreLayout {
    route: Route
  }

  type Route {
    name: String
    fields: [Field]
    placeholders: Placeholders
  }

  type Field {
    name: String
    value: String
  }

  type Placeholders {
    main: [Component]
  }

  type Component {
    name: String
    fields: [Field]
  }
`);

// Helper to load YAML route data
function loadRouteData(site, routePath, language) {
  // Normalize routePath to file path
  let relPath = routePath === '/' ? '' : routePath.replace(/^\//, '');
  let yamlPath;

  // Try to resolve the YAML file for the route
  if (relPath === '') {
    yamlPath = path.join(__dirname, 'data', 'routes', `${language}.yml`);
  } else {
    yamlPath = path.join(__dirname, 'data', 'routes', relPath, `${language}.yml`);
  }

  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  const data = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  return data;
}

// Helper to convert YAML data to GraphQL shape
function toGraphQLRoute(name, data) {
  const fields = data.fields
    ? Object.entries(data.fields).map(([k, v]) => ({ name: k, value: String(v) }))
    : [];

  // Only support 'jss-main' or 'main' placeholder for this mock
  const placeholders = {};
  const main =
    (data.placeholders && (data.placeholders['jss-main'] || data.placeholders['main'])) || [];
  placeholders.main = main.map((comp) => ({
    name: comp.componentName,
    fields: comp.fields
      ? Object.entries(comp.fields).map(([k, v]) => ({ name: k, value: String(v) }))
      : [],
  }));

  return {
    name,
    fields,
    placeholders,
  };
}

const root = {
  layout: ({ site, routePath, language }) => {
    console.log(`Request for site: ${site}, routePath: ${routePath}, language: ${language}`);
    const data = loadRouteData(site, routePath, language);
    if (!data) {
      return {
        sitecore: {
          route: {
            name: 'not-found',
            fields: [{ name: 'pageTitle', value: 'Not Found' }],
            placeholders: { main: [] },
          },
        },
      };
    }
    const name = data.name || routePath.replace(/^\//, '') || 'home';
    console.log('data return', {
      sitecore: {
        route: toGraphQLRoute(name, data),
      },
    });
    return {
      sitecore: {
        route: toGraphQLRoute(name, data),
      },
    };
  },
};

app.use(
  '/sitecore/api/graph/edge',
  graphqlHTTP({
    schema,
    rootValue: root,
    graphiql: true,
  })
);

app.listen(4000, () => {
  console.log('Mock GraphQL running at http://localhost:4000/sitecore/api/graph/edge');
});

