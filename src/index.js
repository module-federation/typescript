const ts = require("typescript");

module.exports = class FederatedTypesPlugin {
  constructor(options) {
    this.options = options;
  }
  apply(compiler) {
    const run = () => {
      // 1. Get the `exposes` value from federationConfig
      // 2. Create .d.ts files in the build directory
      // 3. [TODO] Import the types from `remotes` value from federationConfig
      const fileNames = Object.values(this.options.exposes);

      const program = ts.createProgram(fileNames, {
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "./dist/@federated-types", // replace this with build directory
      });

      program.emit();
      console.log("Types ready for export");
    };

    compiler.hooks.afterCompile.tap("NextFederation", (compilation) => {
      run(compilation);
    });
  }
};
