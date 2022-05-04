## Typescript support for module federated apps

A webpack plugin for sharing typescript types between module federated apps. This plugin is distributed for free via [privjs.com](https://app.privjs.com/buy/packageDetail?pkg=@module-federation/typescript)

### Installation
Procure a free license to this plugin from [privjs.com](https://app.privjs.com/buy/packageDetail?pkg=@module-federation/typescript). Check your email for the private token and then run the following commands:
```
$ npm config set @module-federation:registry https://r.privjs.com
$ npm i @module-federation/typescript
```

### Usage
Register the plugin in webpack.config.js file
```javascript
const FederatedTypesPlugin = require('@module-federation/typescript')

const federationConfig = {
  name: 'my-app',
  filename: 'remoteEntry.js',
  exposes: {
    //...exposed components
    './Button': './src/Button',
    './Input': './src/Input',
  },
  remotes: {
    app2: 'app2@http://localhost:3002/remoteEntry.js',
  },
  shared: ['react', 'react-dom'],
}

plugins: [
  // ...
  new ModuleFederationPlugin(federationConfig),
  new FederatedTypesPlugin(), // Optional: you can pass federationConfig object here as well
]
```

You need to register this plugin in both remote and host apps. The plugin will automatically create a directory named `@mf-typescript` in the host app - that contains all the types exported by the remote apps.

In your file:
```javascript
import RemoteButtonType from "../@mf-typescript/Button";

const RemoteButton = React.lazy(
  () => import("app2/Button")
) as unknown as typeof RemoteButtonType;
```

### Usage in Next.js
You need to manually pass the `federationConfig` object to the plugin. The `remotes` value should contain absolute path.

Sample code:
```javascript
// next.config.js
const FederatedTypesPlugin = require('@module-federation/typescript')

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new ModuleFederationPlugin(federationConfig),
      new FederatedTypesPlugin({
        ...federationConfig,
        remotes: { app2: 'app2@http://localhost:3000/remoteEntry.js' }
      })
    )
    return config
  },
}
```

### Support
Drop me a message on twitter for support/feedback, or maybe just say Hi at [@prasannamestha](https://twitter.com/prasannamestha)

### Credits
Shoutout to [@ScriptedAlchemy](https://twitter.com/ScriptedAlchemy) for helping with the development of this plugin.