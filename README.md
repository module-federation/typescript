## Typescript support for module federated apps

A webpack plugin for sharing typescript types between module federated apps.

### Installation
```
$ npm config set @module-federation:registry https://r.privjs.com
$ npm i @module-federation/typescript
```

### Usage
Register the plugin in webpack.config.js file
```
const FederatedTypesPlugin = require('./webpack/tsplugin')

const federationConfig = {
  name: 'my-app',
  filename: 'remoteEntry.js',
  exposes: {
    './Button': './src/Button',
    './Input': './src/Input',
  },
  shared: ['react', 'react-dom'],
}

plugins: [
  // ...
  new ModuleFederationPlugin(federationConfig),
  new FederatedTypesPlugin(federationConfig),
]
```

You need to register this plugin in both remote and host apps. The plugin will automatically create a directory named `@mf-typescript` in the host app - that contains all the types exported by the remote apps.

In your file:
```
import RemoteButtonType from "../@mf-typescript/Button";

const RemoteButton = React.lazy(
  () => import("app2/Button")
) as unknown as typeof RemoteButtonType;
```


### What's next?
[ ] Refetch types on save