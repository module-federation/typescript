const ts = require("typescript");
const download = require('download');
const fs = require('fs')
const axios = require('axios')
module.exports = class FederatedTypesPlugin {
  constructor(options) {
    this.options = options;
  }
  apply(compiler) {
    const run = () => {
      const exposedComponents = this.options.exposes
      const remoteComponents = this.options.remotes

      if (exposedComponents) {
        const fileNames = Object.values(this.options.exposes);
        const typeFiles = fileNames.map(f => {
          const split = f.split('/')
          return split[split.length - 1] + '.d.ts'
        })

        fs.writeFile('./dist/@mf-typescript/__types_index.json', JSON.stringify(typeFiles), (e) => {
          if (e) {
            console.log('Error saving the types index')
          }
        })
        const program = ts.createProgram(fileNames, {
          declaration: true,
          emitDeclarationOnly: true,
          outDir: "./dist/@mf-typescript/", // replace this with build directory
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
            .catch(e => console.log(e))

        })
      }

    };

    compiler.hooks.afterCompile.tap("FederatedTypes", (compilation) => {
      run(compilation);
    });
  }
};
