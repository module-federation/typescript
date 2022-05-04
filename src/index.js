const ts = require("typescript");
const download = require('download');
const fs = require('fs')
const path = require('path')
const get = require('lodash.get')
const axios = require('axios')
module.exports = class FederatedTypesPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    let recompileInterval
    const options = compiler.options
    const distPath = get(options, 'devServer.static.directory') || get(options, 'output.path') || 'dist'

    const federationOptions = options.plugins.find((plugin) => {
      return plugin.constructor.name === 'ModuleFederationPlugin'
    });
    const inheritedPluginOptions = get(federationOptions, '_options') || null


    const run = () => {
      const exposedComponents = this.options?.exposes || inheritedPluginOptions.exposes
      const remoteComponents = this.options?.remotes || inheritedPluginOptions.remotes

      if (exposedComponents) {
        const fileNames = Object.values(inheritedPluginOptions.exposes || this.options.exposes);
        const typeFiles = fileNames.map(f => {
          const split = f.split('/')
          return split[split.length - 1].split('.')[0] + '.d.ts'
        })

        fs.writeFile(path.join(distPath, '/@mf-typescript/__types_index.json'), JSON.stringify(typeFiles), (e) => {
          if (e) {
            console.log('Error saving the types index', e)
          }
        })
        const program = ts.createProgram(fileNames, {
          declaration: true,
          emitDeclarationOnly: true,
          outDir: path.join(distPath, "./@mf-typescript/"), // replace this with build directory
        });

        program.emit();
      }

      // Time to import the remote types
      if (remoteComponents) {
        // Get the remote URL origin
        const remoteUrls = Object.values(remoteComponents).map(r => {
          const url = new URL(r.split('@')[1])
          return url.origin
        })

        remoteUrls.forEach(remote => {
          axios.get(`${remote}/@mf-typescript/__types_index.json`)
            .then(indexFileResp => {
              // Download all the d.ts files mentioned in the index file
              indexFileResp.data?.forEach(file => download(`${remote}/@mf-typescript/${file}`, '@mf-typescript'))
            })
            .catch(e => console.log('ERROR fetching/writing types', e))
        })
      }
    };

    compiler.hooks.afterCompile.tap("FederatedTypes", (compilation) => {
      // Reset and create an Interval to refetch types every 60 seconds
      clearInterval(recompileInterval);
      if (compiler.options.mode === 'development') {
        recompileInterval = setInterval(() => {
          run(compilation);
        }, 1000 * 60)
      }

      // Runs a compilation immediately
      run(compilation);
    });
  }
};
