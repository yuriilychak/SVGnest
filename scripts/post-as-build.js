import fs from "fs";

const env = process.argv.pop();

function updateFile(suffix, template, change) {
  const outputPath = `src/asm/glue-code.${suffix}`;

  fs.renameSync(`dist/${env}.${suffix}`, outputPath);

  fs.readFile(outputPath, "utf-8", function (err, data) {
    if (err) throw err;

    var newValue = data.replace(template, change);

    fs.writeFile(outputPath, newValue, "utf-8", function (err) {
      if (err) throw err;
      console.log("filelistAsync complete");
    });
  });
}

updateFile(
  "js",
  "const { exports } = await WebAssembly.instantiate(module, adaptedImports);",
  "const instantiated = await WebAssembly.instantiate(module, adaptedImports);\n  const { exports } = instantiated.instance;"
);

updateFile("d.ts", "imports: {", "imports?: {");
