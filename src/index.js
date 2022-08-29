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
    const options = compiler.options;
    const distPath =
      get(options, "devServer.static.directory") ||
      get(options, "output.path") ||
      "dist";

    const typescriptFolderName = "@mf-typescript";
    const typesIndexFileName = "__types_index.json";

    const distDir = path.join(distPath, typescriptFolderName);
    const outFile = path.join(distDir, typesIndexFileName);

    const tsCompilerOptions = {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: path.join(distDir, "/"),
    };

    const federationOptions = options.plugins.find((plugin) => {
      return plugin.constructor.name === "ModuleFederationPlugin";
    });
    const inheritedPluginOptions = get(federationOptions, "_options") || null;

    const exposedComponents =
      this.options?.exposes || inheritedPluginOptions.exposes;
    const remoteComponents =
      this.options?.remotes || inheritedPluginOptions.remotes;

    const run = () => {
      if (exposedComponents) {
        const normalizedFileNames = [];

        const fileNames = Object.values(exposedComponents);

        fileNames.forEach((componentFilePath) => {
          const ext = path.extname(componentFilePath);
          if (["ts", ".tsx"].includes(ext)) {
            const normalizedPath = path.resolve(__dirname, componentFilePath);

            normalizedFileNames.push(normalizedPath);
          } else {
            throw new Error(
              `Can not determine file extension, please include file extension for the file ${componentFilePath}`
            );
          }
        });

        const host = ts.createCompilerHost(tsCompilerOptions);
        const program = ts.createProgram(
          normalizedFileNames,
          tsCompilerOptions,
          host
        );

        const typeFiles = fileNames.map((f) => {
          const split = f.split("/");
          return split[split.length - 1].split(".")[0] + ".d.ts";
        });

        const emitResult = program.emit();

        if (!emitResult.emitSkipped) {
          fs.writeFile(outFile, JSON.stringify(typeFiles), (e) => {
            if (e) {
              console.log("Error saving the types index", e);
            }
          });
        }
      }

      // Time to import the remote types
      if (remoteComponents) {
        // Get the remote URL origin
        const remoteUrls = Object.values(remoteComponents).map((r) => {
          const url = new URL(r.split("@")[1]);
          return url.origin;
        });

        remoteUrls.forEach((remote) => {
          axios
            .get(`${remote}/@mf-typescript/__types_index.json`)
            .then((indexFileResp) => {
              // Download all the d.ts files mentioned in the index file
              indexFileResp.data?.forEach((file) =>
                download(`${remote}/@mf-typescript/${file}`, "@mf-typescript")
              );
            })
            .catch((e) => console.log("ERROR fetching/writing types", e));
        });
      }
    };

    compiler.hooks.afterCompile.tap("FederatedTypes", (compilation) => {
      // Reset and create an Interval to refetch types every 60 seconds
      clearInterval(recompileInterval);
      if (compiler.options.mode === "development") {
        recompileInterval = setInterval(() => {
          run(compilation);
        }, 1000 * 60);
      }

      // Runs a compilation immediately
      run(compilation);
    });
  }
};
