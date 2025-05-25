const { exec } = require('child_process');
const path = require('path');

// Use the full path to wasm-pack
const wasmPackPath = path.join(process.env.HOME, '.cargo', 'bin', 'wasm-pack');

// Set RUSTFLAGS to enable SIMD support
const command = `RUST_BACKTRACE=1 RUSTFLAGS="-C target-feature=+simd128" ${wasmPackPath} build --target web --out-name wasm-nesting --out-dir ./pkg`;
console.log(`Running command: ${command}`);

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        process.exit(1);
    }
    console.log('stdout:', stdout);
    console.log('stderr:', stderr);
});
