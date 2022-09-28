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
      get(this.compilerOptions, "devServer.static.directory") ||
      get(this.compilerOptions, "output.path") ||
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
    const remoteUrls = Object.entries(this.remoteComponents).map(
      ([remote, entry]) => {
        const [, url] = entry.split("@");

        return {
          origin: new URL(url ?? entry).origin,
          remote,
        };
      }
    );

    remoteUrls.forEach(({ origin, remote }) => {
      axios
        .get(
          `${origin}/${this.typescriptFolderName}/${this.typesIndexJsonFileName}`
        )
        .then((indexFileResp) => {
          // Download all the d.ts files mentioned in the index file
          indexFileResp.data?.forEach((file) =>
            download(
              `${origin}/${this.typescriptFolderName}/${file}`,
              `${this.typescriptFolderName}/${remote}`
            )
          );
        })
        .catch((e) => console.log("ERROR fetching/writing types", e));
    });
  }

  getExtension(rootDir, entry) {
    // Check path exists and it's a directory
    if (!fs.existsSync(rootDir) || !fs.lstatSync(rootDir).isDirectory()) {
      throw new Error("rootDir must be a directory");
    }

    let filename;

    try {
      // Try to resolve exposed component using index
      const files = fs.readdirSync(path.join(rootDir, entry));

      filename = files.find((file) => file.split(".")[0] === "index");

      return `${entry}/${filename}`;
    } catch (err) {
      const files = fs.readdirSync(rootDir);

      // Handle case where directory contains similar filenames
      // or where a filename like `Component.base.tsx` is used
      filename = files.find((file) => {
        const baseFile = path.basename(file, path.extname(file));
        const baseEntry = path.basename(entry, path.extname(entry));

        return baseFile === baseEntry;
      });

      return filename;
    }
  }

  extractTypes() {
    const normalizedFileNames = Object.values(this.exposedComponents)
      .map((exposed) => {
        const [rootDir, entry] = exposed.split(/\/(?=[^/]+$)/);
        const ext = this.getExtension(rootDir, entry);

        return path.resolve(process.cwd(), rootDir, ext);
      })
      .filter((entry) => /\.tsx?$/.test(entry));

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
