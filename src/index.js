const ts = require("typescript");
const download = require("download");
const fs = require("fs");
const path = require("path");
const get = require("lodash.get");
const axios = require("axios");

module.exports = class FederatedTypesPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    let recompileInterval;

    this.tsDefinitionFilesMap = {};
    this.compilerOptions = compiler.options;
    this.typescriptFolderName = "@mf-typescript";
    this.typesIndexJsonFileName = "__types_index.json";

    const distPath =
      get(this.options, "devServer.static.directory") ||
      get(this.options, "output.path") ||
      "dist";

    this.distDir = path.join(distPath, this.typescriptFolderName);
    this.typesIndexJsonFile = path.join(
      this.distDir,
      this.typesIndexJsonFileName
    );

    this.tsCompilerOptions = {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: path.join(this.distDir, "/"),
    };

    const federationOptions = this.compilerOptions.plugins.find((plugin) => {
      return plugin.constructor.name === "ModuleFederationPlugin";
    });
    const inheritedPluginOptions = get(federationOptions, "_options") || null;

    this.exposedComponents =
      this.options?.exposes || inheritedPluginOptions.exposes;
    this.remoteComponents =
      this.options?.remotes || inheritedPluginOptions.remotes;

    compiler.hooks.afterCompile.tap("FederatedTypes", (compilation) => {
      // Reset and create an Interval to refetch types every 60 seconds
      clearInterval(recompileInterval);
      if (compiler.options.mode === "development") {
        recompileInterval = setInterval(() => {
          this.run(compilation);
        }, 1000 * 60);
      }

      // Runs a compilation immediately
      this.run(compilation);
    });
  }

  run(compilation) {
    if (this.exposedComponents) {
      this.extractTypes();
    }

    // Time to import the remote types
    if (this.remoteComponents) {
      // Get the remote URL origin
      this.importRemoteTypes();
    }
  }

  importRemoteTypes() {
    const remoteUrls = Object.values(this.remoteComponents).map(r => {
      let remote;
      let url;
    
      if (r.includes('@')) {
        remote = r.split('@')[0];
        url = r.split('@')[1];
      }
    
      const resolvedURL = new URL(url);
    
      return { 
        origin: resolvedURL.origin,
        remote
      };
    });

    remoteUrls.forEach(({ origin, remote }) => {
      axios
        .get(`${remote}/${this.typescriptFolderName}/${this.typesIndexJsonFileName}`)
        .then((indexFileResp) => {
          // Download all the d.ts files mentioned in the index file
          indexFileResp.data?.forEach((file) => download(
            `${remote}/${this.typescriptFolderName}/${file}`,
            `${this.typescriptFolderName}/${remote}`
          ));
        })
        .catch((e) => console.log("ERROR fetching/writing types", e));
    });
  }

  extractTypes() {
    const normalizedFileNames = [];

    const fileNames = Object.values(this.exposedComponents);

    fileNames.forEach((componentFilePath) => {
      const ext = path.extname(componentFilePath);

      // TODO: Resolve the file ext automatically if not provided in the ModuleFederation Config
      if ([".ts", ".tsx"].includes(ext)) {
        const normalizedPath = path.resolve(process.cwd(), componentFilePath);

        normalizedFileNames.push(normalizedPath);
      } else {
        throw new Error(
          `Can not determine file extension, please include file extension for the file ${componentFilePath}`
        );
      }
    });

    const host = ts.createCompilerHost(this.tsCompilerOptions);
    const originalWriteFileFn = host.writeFile;

    host.writeFile = (...args) => {
      const [filename, data] = args;

      this.tsDefinitionFilesMap[filename] = data;

      originalWriteFileFn(...args);
    };

    const program = ts.createProgram(
      normalizedFileNames,
      this.tsCompilerOptions,
      host
    );

    const emitResult = program.emit();

    if (!emitResult.emitSkipped) {
      const files = Object.keys(this.tsDefinitionFilesMap).map((file) =>
        file.slice(`${this.distDir}/`.length)
      );

      fs.writeFile(this.typesIndexJsonFile, JSON.stringify(files), (e) => {
        if (e) {
          console.log("Error saving the types index", e);
        }
      });
    }
  }
};
