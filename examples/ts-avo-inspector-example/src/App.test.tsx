import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

jest.mock('avo-inspector', () => {
  const path = require('path');
  const fs = require('fs');

  const moduleName = 'avo-inspector';
  const modulePath = require.resolve(moduleName);
  const packageJsonPath = path.resolve(modulePath, '..', '..', 'package.json');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.browser) {
    const browserPath = path.resolve(path.dirname(packageJsonPath), packageJson.browser);
    const nodeModulesIndex = browserPath.indexOf('node_modules');
    const startIndex = nodeModulesIndex + 'node_modules/'.length;
    const relativePath = browserPath.substring(startIndex);

    const browserModule = jest.requireActual(browserPath);

    return browserModule; // require("avo-inspector/dist/index.js");
  }

  throw new Error('Browser field not found in package.json');
});

test('renders learn react link', () => {
  const { getByText } = render(<App />);
  const linkElement = getByText(/Event name:/i);
  expect(linkElement).toBeInTheDocument();
});